// thebes.ts
// Client for the Thebes backend canister.

export const BACKEND_CANISTER_ID = 55053167656008;

const BASE = "";

export type Note = {
  id: bigint;
  title: string;
  body: string;
  category: string;
  pinned: boolean;
  color: string;
  createdAt: bigint;
  updatedAt: bigint;
};

// ─────────────────────────────────────────────────────────────
// Hex helpers
// ─────────────────────────────────────────────────────────────

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (x) =>
    x.toString(16).padStart(2, "0")
  ).join("");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.length % 2 === 1 ? "0" + hex : hex;
  const bytes = new Uint8Array(clean.length / 2);

  for (let i = 0; i < bytes.length; i++) {
    const value = parseInt(
      clean.slice(i * 2, i * 2 + 2),
      16
    );

    if (Number.isNaN(value)) {
      throw new Error("invalid hex value");
    }

    bytes[i] = value;
  }

  return bytes;
}

// ─────────────────────────────────────────────────────────────
// Memphis session
// ─────────────────────────────────────────────────────────────

function getSessionTokenHex(): string {
  const api = (
    window as typeof window & {
      MemphisPasskey?: {
        loadSession?: () => {
          session_token_hex?: string;
        } | null;
      };
    }
  ).MemphisPasskey;

  const session = api?.loadSession?.();

  if (!session?.session_token_hex) {
    throw new Error(
      "Please sign in with your Memphis passkey first."
    );
  }

  return session.session_token_hex;
}

// ─────────────────────────────────────────────────────────────
// LEB128
// ─────────────────────────────────────────────────────────────

function uleb(n: bigint): number[] {
  const out: number[] = [];

  for (;;) {
    const byte = Number(n & 0x7fn);
    n >>= 7n;

    if (n === 0n) {
      out.push(byte);
      return out;
    }

    out.push(byte | 0x80);
  }
}

function sleb(n: bigint): number[] {
  const out: number[] = [];

  for (;;) {
    const byte = Number(n & 0x7fn);
    const signBit = byte & 0x40;

    n >>= 7n;

    const done =
      (n === 0n && signBit === 0) ||
      (n === -1n && signBit !== 0);

    if (done) {
      out.push(byte);
      return out;
    }

    out.push(byte | 0x80);
  }
}

function ulebDecode(
  buf: Uint8Array,
  off: number
): [bigint, number] {
  let result = 0n;
  let shift = 0n;

  for (;;) {
    const byte = buf[off++];

    if (byte === undefined) {
      throw new Error("candid: truncated uleb128");
    }

    result |=
      BigInt(byte & 0x7f) << shift;

    if ((byte & 0x80) === 0) {
      return [result, off];
    }

    shift += 7n;
  }
}

function slebDecode(
  buf: Uint8Array,
  off: number
): [bigint, number] {
  let result = 0n;
  let shift = 0n;

  for (;;) {
    const byte = buf[off++];

    if (byte === undefined) {
      throw new Error("candid: truncated sleb128");
    }

    result |=
      BigInt(byte & 0x7f) << shift;

    shift += 7n;

    if ((byte & 0x80) === 0) {
      if (byte & 0x40) {
        result -= 1n << shift;
      }

      return [result, off];
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Candid constants
// ─────────────────────────────────────────────────────────────

const MAGIC = [
  0x44,
  0x49,
  0x44,
  0x4c,
];

const TYPE_NAT = -3n;
const TYPE_INT = -4n;
const TYPE_BOOL = -2n;
const TYPE_NAT8 = -5n;
const TYPE_TEXT = -15n;
const TYPE_VEC = -19n;
const TYPE_RECORD = -20n;

// ─────────────────────────────────────────────────────────────
// Candid record field IDs
// ─────────────────────────────────────────────────────────────

const FIELD_ID_ID = 23515n;
const FIELD_ID_TITLE = 272307608n;
const FIELD_ID_BODY = 1092319906n;
const FIELD_ID_CATEGORY = 2909547262n;
const FIELD_ID_PINNED = 2249497368n;
const FIELD_ID_COLOR = 1247572323n;
const FIELD_ID_CREATED_AT = 1240611067n;
const FIELD_ID_UPDATED_AT = 2196848654n;

// ─────────────────────────────────────────────────────────────
// Candid encoders
// ─────────────────────────────────────────────────────────────

function encodeTextValue(text: string): number[] {
  const utf8 = new TextEncoder().encode(text);

  return [
    ...uleb(BigInt(utf8.length)),
    ...utf8,
  ];
}

function encodeBlobValue(hex: string): number[] {
  const bytes = hexToBytes(hex);

  return [
    ...uleb(BigInt(bytes.length)),
    ...bytes,
  ];
}

// (blob)
function encodeSessionOnly(
  sessionHex: string
): string {
  return bytesToHex(
    new Uint8Array([
      ...MAGIC,

      // type table count
      1,

      // type 0 = vec nat8
      ...sleb(TYPE_VEC),
      ...sleb(TYPE_NAT8),

      // argument count
      1,

      // argument type = type 0
      0,

      // value
      ...encodeBlobValue(sessionHex),
    ])
  );
}

// (blob, text, text, text, text)
function encodeSessionAndFourTexts(
  sessionHex: string,
  title: string,
  body: string,
  category: string,
  color: string
): string {
  return bytesToHex(
    new Uint8Array([
      ...MAGIC,

      1,

      ...sleb(TYPE_VEC),
      ...sleb(TYPE_NAT8),

      5,

      0,
      ...sleb(TYPE_TEXT),
      ...sleb(TYPE_TEXT),
      ...sleb(TYPE_TEXT),
      ...sleb(TYPE_TEXT),

      ...encodeBlobValue(sessionHex),
      ...encodeTextValue(title),
      ...encodeTextValue(body),
      ...encodeTextValue(category),
      ...encodeTextValue(color),
    ])
  );
}

// (blob, nat, text, text, text, text)
function encodeSessionNatAndFourTexts(
  sessionHex: string,
  id: bigint,
  title: string,
  body: string,
  category: string,
  color: string
): string {
  return bytesToHex(
    new Uint8Array([
      ...MAGIC,

      1,

      ...sleb(TYPE_VEC),
      ...sleb(TYPE_NAT8),

      6,

      0,
      ...sleb(TYPE_NAT),
      ...sleb(TYPE_TEXT),
      ...sleb(TYPE_TEXT),
      ...sleb(TYPE_TEXT),
      ...sleb(TYPE_TEXT),

      ...encodeBlobValue(sessionHex),
      ...uleb(id),
      ...encodeTextValue(title),
      ...encodeTextValue(body),
      ...encodeTextValue(category),
      ...encodeTextValue(color),
    ])
  );
}

// (blob, nat)
function encodeSessionAndNat(
  sessionHex: string,
  id: bigint
): string {
  return bytesToHex(
    new Uint8Array([
      ...MAGIC,

      1,

      ...sleb(TYPE_VEC),
      ...sleb(TYPE_NAT8),

      2,

      0,
      ...sleb(TYPE_NAT),

      ...encodeBlobValue(sessionHex),
      ...uleb(id),
    ])
  );
}

// ─────────────────────────────────────────────────────────────
// Candid decoder
// ─────────────────────────────────────────────────────────────

function readText(
  buf: Uint8Array,
  off: number
): [string, number] {
  let len: bigint;

  [len, off] = ulebDecode(buf, off);

  const size = Number(len);
  const end = off + size;

  if (end > buf.length) {
    throw new Error("candid: truncated text");
  }

  return [
    new TextDecoder().decode(
      buf.slice(off, end)
    ),
    end,
  ];
}

function readNat(
  buf: Uint8Array,
  off: number
): [bigint, number] {
  return ulebDecode(buf, off);
}

function readInt(
  buf: Uint8Array,
  off: number
): [bigint, number] {
  return slebDecode(buf, off);
}

type CandidType =
  | {
      kind: "vec";
      elementType: bigint;
    }
  | {
      kind: "record";
      fields: {
        id: bigint;
        type: bigint;
      }[];
    };

function readTypeTable(
  buf: Uint8Array,
  off: number,
  count: bigint
): [CandidType[], number] {
  const types: CandidType[] = [];

  for (let i = 0n; i < count; i++) {
    let typeCode: bigint;

    [typeCode, off] =
      slebDecode(buf, off);

    if (typeCode === TYPE_VEC) {
      let elementType: bigint;

      [elementType, off] =
        slebDecode(buf, off);

      types.push({
        kind: "vec",
        elementType,
      });

      continue;
    }

    if (typeCode === TYPE_RECORD) {
      let fieldCount: bigint;

      [fieldCount, off] =
        ulebDecode(buf, off);

      const fields: {
        id: bigint;
        type: bigint;
      }[] = [];

      for (
        let j = 0n;
        j < fieldCount;
        j++
      ) {
        let fieldId: bigint;
        let fieldType: bigint;

        [fieldId, off] =
          ulebDecode(buf, off);

        [fieldType, off] =
          slebDecode(buf, off);

        fields.push({
          id: fieldId,
          type: fieldType,
        });
      }

      types.push({
        kind: "record",
        fields,
      });

      continue;
    }

    throw new Error(
      `candid: unsupported type table entry ${typeCode}`
    );
  }

  return [types, off];
}

function decodeValue(
  buf: Uint8Array,
  off: number,
  type: bigint,
  types: CandidType[]
): [unknown, number] {
  if (type === TYPE_NAT) {
    return readNat(buf, off);
  }

  if (type === TYPE_INT) {
    return readInt(buf, off);
  }

  if (type === TYPE_BOOL) {
    if (off >= buf.length) {
      throw new Error("candid: truncated bool");
    }

    const value = buf[off];

    if (value !== 0 && value !== 1) {
      throw new Error(
        `candid: invalid bool value ${value}`
      );
    }

    return [
      value === 1,
      off + 1,
    ];
  }

  if (type === TYPE_TEXT) {
    return readText(buf, off);
  }

  if (type >= 0n) {
    const definition =
      types[Number(type)];

    if (!definition) {
      throw new Error(
        `candid: invalid type table reference ${type}`
      );
    }

    if (definition.kind === "vec") {
      let length: bigint;

      [length, off] =
        ulebDecode(buf, off);

      const result: unknown[] = [];

      for (
        let i = 0n;
        i < length;
        i++
      ) {
        let value: unknown;

        [value, off] =
          decodeValue(
            buf,
            off,
            definition.elementType,
            types
          );

        result.push(value);
      }

      return [
        result,
        off,
      ];
    }

    if (definition.kind === "record") {
      const values: unknown[] = [];

      for (
        const field of definition.fields
      ) {
        let value: unknown;

        [value, off] =
          decodeValue(
            buf,
            off,
            field.type,
            types
          );

        values.push(value);
      }

      return [
        values,
        off,
      ];
    }
  }

  throw new Error(
    `candid: unsupported value type ${type}`
  );
}

// ─────────────────────────────────────────────────────────────
// Primitive reply decoder
// ─────────────────────────────────────────────────────────────

export function decodeReply(
  hex: string
): string | bigint | boolean {
  const buf = hexToBytes(hex);

  if (
    buf.length < 4 ||
    buf[0] !== 0x44 ||
    buf[1] !== 0x49 ||
    buf[2] !== 0x44 ||
    buf[3] !== 0x4c
  ) {
    throw new Error(
      "candid: bad magic in reply"
    );
  }

  let off = 4;

  let tableCount: bigint;

  [tableCount, off] =
    ulebDecode(buf, off);

  const [types, newOff] =
    readTypeTable(
      buf,
      off,
      tableCount
    );

  off = newOff;

  let argCount: bigint;

  [argCount, off] =
    ulebDecode(buf, off);

  if (argCount === 0n) {
    return "";
  }

  if (argCount !== 1n) {
    throw new Error(
      `candid: expected one return value, got ${argCount}`
    );
  }

  let type: bigint;

  [type, off] =
    slebDecode(buf, off);

  const [value] =
    decodeValue(
      buf,
      off,
      type,
      types
    );

  if (
    typeof value !== "string" &&
    typeof value !== "bigint" &&
    typeof value !== "boolean"
  ) {
    throw new Error(
      "candid: expected primitive reply"
    );
  }

  return value;
}

// ─────────────────────────────────────────────────────────────
// Note list decoder
// ─────────────────────────────────────────────────────────────

export function decodeNotes(
  hex: string
): Note[] {
  const buf = hexToBytes(hex);

  if (
    buf.length < 4 ||
    buf[0] !== 0x44 ||
    buf[1] !== 0x49 ||
    buf[2] !== 0x44 ||
    buf[3] !== 0x4c
  ) {
    throw new Error(
      "candid: bad magic in notes reply"
    );
  }

  let off = 4;

  let tableCount: bigint;

  [tableCount, off] =
    ulebDecode(buf, off);

  const [types, newOff] =
    readTypeTable(
      buf,
      off,
      tableCount
    );

  off = newOff;

  let argCount: bigint;

  [argCount, off] =
    ulebDecode(buf, off);

  if (argCount !== 1n) {
    throw new Error(
      `candid: expected one return value, got ${argCount}`
    );
  }

  let returnType: bigint;

  [returnType, off] =
    slebDecode(buf, off);

  const [value] =
    decodeValue(
      buf,
      off,
      returnType,
      types
    );

  if (!Array.isArray(value)) {
    throw new Error(
      "candid: expected a vector of notes"
    );
  }

  let recordType: bigint | null = null;

  if (returnType >= 0n) {
    const vectorDefinition =
      types[Number(returnType)];

    if (
      vectorDefinition &&
      vectorDefinition.kind === "vec"
    ) {
      recordType =
        vectorDefinition.elementType;
    }
  }

  if (
    recordType === null ||
    recordType < 0n
  ) {
    throw new Error(
      "candid: invalid Note vector type"
    );
  }

  const recordDefinition =
    types[Number(recordType)];

  if (
    !recordDefinition ||
    recordDefinition.kind !== "record"
  ) {
    throw new Error(
      "candid: invalid Note record definition"
    );
  }

  return value.map((item) => {
    if (
      !Array.isArray(item) ||
      item.length !==
        recordDefinition.fields.length
    ) {
      throw new Error(
        "candid: invalid Note record"
      );
    }

    const fields =
      new Map<bigint, unknown>();

    for (
      let i = 0;
      i < recordDefinition.fields.length;
      i++
    ) {
      fields.set(
        recordDefinition.fields[i].id,
        item[i]
      );
    }

    const id =
      fields.get(FIELD_ID_ID);

    const title =
      fields.get(FIELD_ID_TITLE);

    const body =
      fields.get(FIELD_ID_BODY);

    const category =
      fields.get(FIELD_ID_CATEGORY);

    const pinned =
      fields.get(FIELD_ID_PINNED);

    const color =
      fields.get(FIELD_ID_COLOR);

    const createdAt =
      fields.get(FIELD_ID_CREATED_AT);

    const updatedAt =
      fields.get(FIELD_ID_UPDATED_AT);

    if (
      typeof id !== "bigint" ||
      typeof title !== "string" ||
      typeof body !== "string" ||
      typeof category !== "string" ||
      typeof pinned !== "boolean" ||
      typeof color !== "string" ||
      typeof createdAt !== "bigint" ||
      typeof updatedAt !== "bigint"
    ) {
      console.log(
        "Decoded Note fields:",
        {
          id,
          title,
          body,
          category,
          pinned,
          color,
          createdAt,
          updatedAt,
        }
      );

      console.log(
        "Candid record fields:",
        recordDefinition.fields
      );

      throw new Error(
        "candid: invalid Note fields"
      );
    }

    return {
      id,
      title,
      body,
      category,
      pinned,
      color,
      createdAt,
      updatedAt,
    };
  });
}

// ─────────────────────────────────────────────────────────────
// Sender
// ─────────────────────────────────────────────────────────────

function demoSender(): string {
  const KEY =
    `thebes-demo-sender:${BACKEND_CANISTER_ID}`;

  let sender =
    localStorage.getItem(KEY);

  if (!sender) {
    const bytes =
      new Uint8Array(8);

    crypto.getRandomValues(bytes);

    sender =
      bytesToHex(bytes);

    localStorage.setItem(
      KEY,
      sender
    );
  }

  return sender;
}

// ─────────────────────────────────────────────────────────────
// Network
// ─────────────────────────────────────────────────────────────

const RETRIES = 3;

function isTransient(
  status: number,
  body: string
): boolean {
  return (
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /validator unreachable|no healthy validator|unhealthy/i.test(
      body
    )
  );
}

async function fetchWithRetry(
  url: string,
  init?: RequestInit
): Promise<any> {
  let lastErr = "";

  for (
    let attempt = 0;
    attempt <= RETRIES;
    attempt++
  ) {
    if (attempt > 0) {
      await new Promise(
        (resolve) =>
          setTimeout(
            resolve,
            400 * attempt
          )
      );
    }

    try {
      const response =
        await fetch(
          url,
          init
        );

      const text =
        await response.text();

      if (
        !response.ok &&
        isTransient(
          response.status,
          text
        )
      ) {
        lastErr =
          `HTTP ${response.status}: ${text.slice(
            0,
            200
          )}`;

        continue;
      }

      try {
        return JSON.parse(text);
      } catch {
        throw new Error(
          `malformed reply: ${text.slice(
            0,
            200
          )}`
        );
      }
    } catch (e) {
      lastErr = String(e);
    }
  }

  throw new Error(
    `the network is briefly unreachable — please try again (${lastErr})`
  );
}

// ─────────────────────────────────────────────────────────────
// Query - kept for compatibility, but private list does NOT use it
// ─────────────────────────────────────────────────────────────

export async function query(
  method: string,
  argHex: string
): Promise<string | bigint | boolean> {
  const response =
    await fetchWithRetry(
      `${BASE}/api/query`,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
        },
        body: JSON.stringify({
          canister_id:
            BACKEND_CANISTER_ID,
          method,
          arg: argHex,
          sender: demoSender(),
        }),
      }
    );

  if (
    response.status !==
    "success"
  ) {
    throw new Error(
      response.error ||
        "query failed"
    );
  }

  return decodeReply(
    response.reply || ""
  );
}

// ─────────────────────────────────────────────────────────────
// Submit update call
// ─────────────────────────────────────────────────────────────

async function submitCall(
  method: string,
  argHex: string,
  sender: string,
  nonce: number
): Promise<any> {
  const response =
    await fetch(
      `${BASE}/api/call`,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
        },
        body: JSON.stringify({
          canister_id:
            BACKEND_CANISTER_ID,
          method,
          arg: argHex,
          sender,
          nonce,
        }),
      }
    );

  const text =
    await response.text();

  if (
    !response.ok &&
    isTransient(
      response.status,
      text
    )
  ) {
    throw new Error(
      "the network is briefly unreachable — please try again"
    );
  }

  return JSON.parse(text);
}

// ─────────────────────────────────────────────────────────────
// Raw receipt
// ─────────────────────────────────────────────────────────────

async function pollReceiptRaw(
  hashHex: string
): Promise<string> {
  const deadline =
    Date.now() + 30_000;

  let transientPolls = 0;

  while (
    Date.now() < deadline
  ) {
    try {
      const response =
        await fetchWithRetry(
          `${BASE}/api/receipt?hash=${hashHex}`
        );

      if (response.found) {
        if (
          response.status ===
          "success"
        ) {
          return response.reply || "";
        }

        throw new Error(
          response.error ||
            "call failed on chain"
        );
      }
    } catch (e) {
      transientPolls++;

      if (
        transientPolls > 10
      ) {
        throw e;
      }
    }

    await new Promise(
      (resolve) =>
        setTimeout(
          resolve,
          500
        )
    );
  }

  throw new Error(
    "timed out waiting for the chain's receipt"
  );
}

// ─────────────────────────────────────────────────────────────
// Generic update call
// ─────────────────────────────────────────────────────────────

export async function call(
  method: string,
  argHex: string
): Promise<string | bigint | boolean> {
  const sender =
    demoSender();

  const nonceResponse =
    await fetchWithRetry(
      `${BASE}/api/next_nonce?sender=${sender}`,
      {
        cache: "no-store",
      }
    );

  if (
    typeof nonceResponse.next_nonce !==
    "number"
  ) {
    throw new Error(
      "malformed next_nonce reply"
    );
  }

  let response =
    await submitCall(
      method,
      argHex,
      sender,
      nonceResponse.next_nonce
    );

  if (
    !response.queued &&
    typeof response.error ===
      "string" &&
    /nonce .* already used/i.test(
      response.error
    )
  ) {
    const match =
      response.error.match(
        /last seen:\s*(\d+)/i
      );

    const recoveredNonce =
      match
        ? Number(match[1]) + 1
        : nonceResponse.next_nonce + 1;

    response =
      await submitCall(
        method,
        argHex,
        sender,
        recoveredNonce
      );
  }

  if (
    !response.queued ||
    !response.message_hash
  ) {
    throw new Error(
      response.error ||
        "call rejected"
    );
  }

  const rawReply =
    await pollReceiptRaw(
      response.message_hash
    );

  return decodeReply(
    rawReply
  );
}

// ─────────────────────────────────────────────────────────────
// Notes API
// ─────────────────────────────────────────────────────────────

export async function addNote(
  title: string,
  body: string,
  category: string,
  color: string
): Promise<bigint> {
  const session =
    getSessionTokenHex();

  const result =
    await call(
      "add",
      encodeSessionAndFourTexts(
        session,
        title,
        body,
        category,
        color
      )
    );

  if (
    typeof result !==
    "bigint"
  ) {
    throw new Error(
      "add: expected Nat reply"
    );
  }

  return result;
}

export async function listNotes(): Promise<Note[]> {
  const session =
    getSessionTokenHex();

  const sender =
    demoSender();

  const nonceResponse =
    await fetchWithRetry(
      `${BASE}/api/next_nonce?sender=${sender}`,
      {
        cache: "no-store",
      }
    );

  if (
    typeof nonceResponse.next_nonce !==
    "number"
  ) {
    throw new Error(
      "malformed next_nonce reply"
    );
  }

  let response =
    await submitCall(
      "list",
      encodeSessionOnly(session),
      sender,
      nonceResponse.next_nonce
    );

  if (
    !response.queued &&
    typeof response.error ===
      "string" &&
    /nonce .* already used/i.test(
      response.error
    )
  ) {
    const match =
      response.error.match(
        /last seen:\s*(\d+)/i
      );

    const recoveredNonce =
      match
        ? Number(match[1]) + 1
        : nonceResponse.next_nonce + 1;

    response =
      await submitCall(
        "list",
        encodeSessionOnly(session),
        sender,
        recoveredNonce
      );
  }

  if (
    !response.queued ||
    !response.message_hash
  ) {
    throw new Error(
      response.error ||
        "list call rejected"
    );
  }

  const rawReply =
    await pollReceiptRaw(
      response.message_hash
    );

  return decodeNotes(
    rawReply
  );
}

export async function editNote(
  id: bigint,
  title: string,
  body: string,
  category: string,
  color: string
): Promise<boolean> {
  const session =
    getSessionTokenHex();

  const result =
    await call(
      "edit",
      encodeSessionNatAndFourTexts(
        session,
        id,
        title,
        body,
        category,
        color
      )
    );

  if (
    typeof result !==
    "boolean"
  ) {
    throw new Error(
      "edit: expected Bool reply"
    );
  }

  return result;
}

export async function togglePin(
  id: bigint
): Promise<boolean> {
  const session =
    getSessionTokenHex();

  const result =
    await call(
      "togglePin",
      encodeSessionAndNat(
        session,
        id
      )
    );

  if (
    typeof result !==
    "boolean"
  ) {
    throw new Error(
      "togglePin: expected Bool reply"
    );
  }

  return result;
}

export async function removeNote(
  id: bigint
): Promise<boolean> {
  const session =
    getSessionTokenHex();

  const result =
    await call(
      "remove",
      encodeSessionAndNat(
        session,
        id
      )
    );

  if (
    typeof result !==
    "boolean"
  ) {
    throw new Error(
      "remove: expected Bool reply"
    );
  }

  return result;
}