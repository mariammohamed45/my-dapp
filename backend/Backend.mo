import Array "mo:core/Array";
import Time "mo:core/Time";
import Principal "mo:core/Principal";
import Blob "mo:core/Blob";
import Runtime "mo:core/Runtime";
import MemphisAuth "mo:thebes-lib/MemphisAuth";

persistent actor Notes {

  public type Note = {
    id : Nat;
    title : Text;
    body : Text;
    category : Text;
    pinned : Bool;
    color : Text;
    createdAt : Int;
    updatedAt : Int;
    owner : Principal;
  };

  var notes : [Note] = [];
  var nextId : Nat = 0;

  func appendOne<T>(arr : [T], item : T) : [T] {
    Array.tabulate<T>(
      arr.size() + 1,
      func(i : Nat) : T {
        if (i < arr.size()) {
          arr[i]
        } else {
          item
        };
      },
    );
  };

  transient let AUDIENCE = "https://memphis.mercaturaforum.com";

  let gate = MemphisAuth.initFromCid(921, AUDIENCE, 0);

  func requireCaller(token : Blob) : async* Principal {
    switch (await* MemphisAuth.verifyWithAudience(gate, token, AUDIENCE)) {

      case (#ok(identity)) {
        identity.principal;
      };

      case (#err(#Expired)) {
        Runtime.trap("session expired - please sign in again");
      };

      case (#err(#Memphis(err))) {
        switch (err) {

          case (#NotAuthenticated) {
            Runtime.trap("Memphis: NotAuthenticated");
          };

          case (#Unauthorized) {
            Runtime.trap("Memphis: Unauthorized");
          };

          case (#SessionExpired) {
            Runtime.trap("Memphis: SessionExpired");
          };

          case (#ChallengeExpired) {
            Runtime.trap("Memphis: ChallengeExpired");
          };

          case (#AnchorNotFound) {
            Runtime.trap("Memphis: AnchorNotFound");
          };

          case (#FactorNotFound) {
            Runtime.trap("Memphis: FactorNotFound");
          };

          case (#InsufficientFactors) {
            Runtime.trap("Memphis: InsufficientFactors");
          };

          case (#DuplicateCredential) {
            Runtime.trap("Memphis: DuplicateCredential");
          };

          case (#InvalidArgument(msg)) {
            Runtime.trap("Memphis: InvalidArgument - " # msg);
          };

          case (#InvariantViolation(e)) {
            Runtime.trap(
              "Memphis: InvariantViolation - "
              # e.id
              # " - "
              # e.details
            );
          };
        };
      };
    };
  };

  public func add(
    token : Blob,
    title : Text,
    body : Text,
    category : Text,
    color : Text
  ) : async Nat {
    let caller = await* requireCaller(token);
    let now = Time.now();

    let newNote : Note = {
      id = nextId;
      title;
      body;
      category;
      pinned = false;
      color;
      createdAt = now;
      updatedAt = now;
      owner = caller;
    };

    notes := appendOne(notes, newNote);
    nextId += 1;

    newNote.id;
  };

  public func list(token : Blob) : async [Note] {
    let caller = await* requireCaller(token);

    Array.filter<Note>(
      notes,
      func(n : Note) : Bool {
        n.owner == caller
      },
    );
  };

  public func edit(
    token : Blob,
    id : Nat,
    title : Text,
    body : Text,
    category : Text,
    color : Text
  ) : async Bool {
    let caller = await* requireCaller(token);

    let found = Array.find<Note>(
      notes,
      func(n : Note) : Bool {
        n.id == id
      },
    );

    switch (found) {

      case null {
        false;
      };

      case (?note) {

        if (note.owner != caller) {
          Runtime.trap("not your note");
        };

        let updated : Note = {
          note with
          title;
          body;
          category;
          color;
          updatedAt = Time.now();
        };

        notes := Array.map<Note, Note>(
          notes,
          func(n : Note) : Note {
            if (n.id == id) {
              updated
            } else {
              n
            };
          },
        );

        true;
      };
    };
  };

  public func togglePin(
    token : Blob,
    id : Nat
  ) : async Bool {
    let caller = await* requireCaller(token);

    let found = Array.find<Note>(
      notes,
      func(n : Note) : Bool {
        n.id == id
      },
    );

    switch (found) {

      case null {
        false;
      };

      case (?note) {

        if (note.owner != caller) {
          Runtime.trap("not your note");
        };

        let updated : Note = {
          note with
          pinned = not note.pinned;
          updatedAt = Time.now();
        };

        notes := Array.map<Note, Note>(
          notes,
          func(n : Note) : Note {
            if (n.id == id) {
              updated
            } else {
              n
            };
          },
        );

        true;
      };
    };
  };

  public func remove(
    token : Blob,
    id : Nat
  ) : async Bool {
    let caller = await* requireCaller(token);

    let found = Array.find<Note>(
      notes,
      func(n : Note) : Bool {
        n.id == id
      },
    );

    switch (found) {

      case null {
        false;
      };

      case (?note) {

        if (note.owner != caller) {
          Runtime.trap("not your note");
        };

        let oldSize = notes.size();

        notes := Array.filter<Note>(
          notes,
          func(n : Note) : Bool {
            n.id != id
          },
        );

        notes.size() < oldSize;
      };
    };
  };
};

