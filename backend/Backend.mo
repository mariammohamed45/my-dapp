import Array "mo:base/Array";
import Time "mo:base/Time";

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
  };

  var notes : [Note] = [];
  var nextId : Nat = 0;

  public func add(
    title : Text,
    body : Text,
    category : Text,
    color : Text
  ) : async Nat {

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

    notes := Array.append(notes, [newNote]);
    nextId += 1;

    newNote.id
  };

  public query func list() : async [Note] {
    notes
  };

  public func edit(
    id : Nat,
    title : Text,
    body : Text,
    category : Text,
    color : Text
  ) : async Bool {

    let oldNote = Array.find<Note>(
      notes,
      func(note : Note) : Bool {
        note.id == id
      }
    );

    switch (oldNote) {

      case (null) {
        false
      };

      case (?note) {

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

        notes := Array.map<Note, Note>(
          notes,
          func(item : Note) : Note {
            if (item.id == id) {
              updatedNote
            } else {
              item
            }
          }
        );

        true
      };
    }
  };

  public func togglePin(id : Nat) : async Bool {

    let oldNote = Array.find<Note>(
      notes,
      func(note : Note) : Bool {
        note.id == id
      }
    );

    switch (oldNote) {

      case (null) {
        false
      };

      case (?note) {

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

        notes := Array.map<Note, Note>(
          notes,
          func(item : Note) : Note {
            if (item.id == id) {
              updatedNote
            } else {
              item
            }
          }
        );

        true
      };
    }
  };

  public func remove(id : Nat) : async Bool {

    let oldSize = notes.size();

    notes := Array.filter<Note>(
      notes,
      func(note : Note) : Bool {
        note.id != id
      }
    );

    notes.size() < oldSize
  };
}