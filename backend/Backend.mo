import Array "mo:base/Array";
import Principal "mo:base/Principal";
import Time "mo:base/Time";
import Blob "mo:base/Blob";
import Debug "mo:base/Debug";

import MemphisAuth "mo:thebes-lib/MemphisAuth";

persistent actor Notes {

  // ============================================================
  // PUBLIC NOTE TYPE
  // IMPORTANT:
  // Keep this shape unchanged.
  // The frontend Candid decoder depends on these fields.
  // ============================================================

  public type Note = {
    id : Nat;
    title : Text;
    body : Text;
    category : Text;
    pinned : Bool;
    color : Text;
    createdAt : Int;
    updatedAt : Int;
  };

  // ============================================================
  // PRIVATE STORAGE TYPE
  // ============================================================

  type OwnedNote = {
    owner : Principal;
    note : Note;
  };

  var notes : [OwnedNote] = [];
  var nextId : Nat = 0;

  // ============================================================
  // MEMPHIS AUTHENTICATION
  // ============================================================

  // Memphis production contract.
  // CID 921.
  //
  // "my-dapp" is the stable pseudonym namespace.
  // DO NOT change this after users have created data.
  //
  // Version 1 is our identity-scheme version.
  var gate = MemphisAuth.initFromCid(
    921,
    "my-dapp",
    1
  );

  // This MUST be the exact web origin where the app is served.
  // No trailing slash.
  // No path.
  // No port.
  let AUDIENCE = "https://memphis.mercaturaforum.com";

  // ------------------------------------------------------------
  // Verify Memphis session token and return the user's
  // stable per-app Principal.
  // ------------------------------------------------------------

  func authenticate(
    session : Blob
  ) : async* Principal {

    switch (
      await* MemphisAuth.verifyWithAudience(
        gate,
        session,
        AUDIENCE
      )
    ) {

      case (#ok(identity)) {
        identity.principal
      };

      case (#err(_)) {
        Debug.trap(
          "Memphis authentication failed"
        )
      };
    }
  };

  // ============================================================
  // ADD
  // ============================================================

  public shared func add(
    session : Blob,
    title : Text,
    body : Text,
    category : Text,
    color : Text
  ) : async Nat {

    let owner = await* authenticate(session);

    let now = Time.now();

    let newNote : Note = {
      id = nextId;
      title = title;
      body = body;
      category = category;
      pinned = false;
      color = color;
      createdAt = now;
      updatedAt = now;
    };

    let ownedNote : OwnedNote = {
      owner = owner;
      note = newNote;
    };

    notes := Array.append(
      notes,
      [ownedNote]
    );

    nextId += 1;

    newNote.id
  };

  // ============================================================
  // LIST
  //
  // IMPORTANT:
  // This is intentionally NOT a query.
  // Memphis verification requires an inter-canister update call.
  // ============================================================

  public shared func list(
    session : Blob
  ) : async [Note] {

    let owner = await* authenticate(session);

    Array.mapFilter<OwnedNote, Note>(
      notes,
      func(item : OwnedNote) : ?Note {
        if (
          Principal.equal(
            item.owner,
            owner
          )
        ) {
          ?item.note
        } else {
          null
        }
      }
    )
  };

  // ============================================================
  // EDIT
  // ============================================================

  public shared func edit(
    session : Blob,
    id : Nat,
    title : Text,
    body : Text,
    category : Text,
    color : Text
  ) : async Bool {

    let owner = await* authenticate(session);

    let oldNote = Array.find<OwnedNote>(
      notes,
      func(item : OwnedNote) : Bool {
        Principal.equal(
          item.owner,
          owner
        )
        and item.note.id == id
      }
    );

    switch (oldNote) {

      case (null) {
        false
      };

      case (?ownedNote) {

        let note = ownedNote.note;

        let updatedNote : Note = {
          id = note.id;
          title = title;
          body = body;
          category = category;
          pinned = note.pinned;
          color = color;
          createdAt = note.createdAt;
          updatedAt = Time.now();
        };

        notes := Array.map<OwnedNote, OwnedNote>(
          notes,
          func(item : OwnedNote) : OwnedNote {

            if (
              Principal.equal(
                item.owner,
                owner
              )
              and item.note.id == id
            ) {
              {
                owner = item.owner;
                note = updatedNote;
              }
            } else {
              item
            }
          }
        );

        true
      };
    }
  };

  // ============================================================
  // TOGGLE PIN
  // ============================================================

  public shared func togglePin(
    session : Blob,
    id : Nat
  ) : async Bool {

    let owner = await* authenticate(session);

    let oldNote = Array.find<OwnedNote>(
      notes,
      func(item : OwnedNote) : Bool {
        Principal.equal(
          item.owner,
          owner
        )
        and item.note.id == id
      }
    );

    switch (oldNote) {

      case (null) {
        false
      };

      case (?ownedNote) {

        let note = ownedNote.note;

        let updatedNote : Note = {
          id = note.id;
          title = note.title;
          body = note.body;
          category = note.category;
          pinned = not note.pinned;
          color = note.color;
          createdAt = note.createdAt;
          updatedAt = Time.now();
        };

        notes := Array.map<OwnedNote, OwnedNote>(
          notes,
          func(item : OwnedNote) : OwnedNote {

            if (
              Principal.equal(
                item.owner,
                owner
              )
              and item.note.id == id
            ) {
              {
                owner = item.owner;
                note = updatedNote;
              }
            } else {
              item
            }
          }
        );

        true
      };
    }
  };

  // ============================================================
  // REMOVE
  // ============================================================

  public shared func remove(
    session : Blob,
    id : Nat
  ) : async Bool {

    let owner = await* authenticate(session);

    let oldSize = notes.size();

    notes := Array.filter<OwnedNote>(
      notes,
      func(item : OwnedNote) : Bool {

        not (
          Principal.equal(
            item.owner,
            owner
          )
          and item.note.id == id
        )
      }
    );

    notes.size() < oldSize
  };
}