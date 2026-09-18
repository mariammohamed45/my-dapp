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
    isShared : Bool;
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

  // ── Points ──────────────────────────────────────────────
  // Every member gets 100 points, granted exactly once, the first
  // time their principal is seen (see ensureBalance below, called
  // from requireCaller on every authenticated call).

  let STARTING_POINTS : Nat = 100;

  var balances : [(Principal, Nat)] = [];

  func findBalanceEntry(p : Principal) : ?(Principal, Nat) {
    Array.find<(Principal, Nat)>(
      balances,
      func(entry : (Principal, Nat)) : Bool {
        entry.0 == p
      },
    );
  };

  func ensureBalance(p : Principal) : Nat {
    switch (findBalanceEntry(p)) {

      case (?entry) {
        entry.1;
      };

      case null {
        balances := appendOne(balances, (p, STARTING_POINTS));
        STARTING_POINTS;
      };
    };
  };

  func setBalance(p : Principal, amount : Nat) {
    var found = false;

    balances := Array.map<(Principal, Nat), (Principal, Nat)>(
      balances,
      func(entry : (Principal, Nat)) : (Principal, Nat) {
        if (entry.0 == p) {
          found := true;
          (p, amount);
        } else {
          entry;
        };
      },
    );

    if (not found) {
      balances := appendOne(balances, (p, amount));
    };
  };

  // ── Tips ────────────────────────────────────────────────

  public type TipRecord = {
    from : Principal;
    to : Principal;
    amount : Nat;
    noteId : Nat;
    timestamp : Int;
  };

  var tips : [TipRecord] = [];

  transient let AUDIENCE = "https://memphis.mercaturaforum.com";

  let gate = MemphisAuth.initFromCid(921, AUDIENCE, 0);

  func requireCaller(token : Blob) : async* Principal {
    switch (await* MemphisAuth.verifyWithAudience(gate, token, AUDIENCE)) {

      case (#ok(identity)) {
        ignore ensureBalance(identity.principal);
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
      isShared = false;
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

  public func feed(token : Blob) : async [Note] {
    let _caller = await* requireCaller(token);

    Array.filter<Note>(
      notes,
      func(n : Note) : Bool {
        n.isShared
      },
    );
  };

  public func getBalance(token : Blob) : async Nat {
    let caller = await* requireCaller(token);

    ensureBalance(caller);
  };

  public func tip(
    token : Blob,
    noteId : Nat,
    amount : Nat
  ) : async Bool {
    let caller = await* requireCaller(token);

    let found = Array.find<Note>(
      notes,
      func(n : Note) : Bool {
        n.id == noteId
      },
    );

    switch (found) {

      case null {
        Runtime.trap("note not found");
      };

      case (?note) {

        if (note.owner == caller) {
          Runtime.trap("cannot tip your own note");
        };

        let senderBalance = ensureBalance(caller);

        if (senderBalance < amount) {
          Runtime.trap("insufficient points");
        };

        let receiverBalance = ensureBalance(note.owner);

        setBalance(caller, senderBalance - amount);
        setBalance(note.owner, receiverBalance + amount);

        let record : TipRecord = {
          from = caller;
          to = note.owner;
          amount;
          noteId;
          timestamp = Time.now();
        };

        tips := appendOne(tips, record);

        true;
      };
    };
  };

  public func getMyTips(token : Blob) : async [TipRecord] {
    let caller = await* requireCaller(token);

    Array.filter<TipRecord>(
      tips,
      func(t : TipRecord) : Bool {
        t.from == caller or t.to == caller
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

  public func toggleShare(
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
          isShared = not note.isShared;
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
