import "fake-indexeddb/auto";
import { it, expect, vi } from "vitest";
import { emptyData, readData, readLocalDataRaw, restoreLocalData, writeData, newCard, grade, Rating } from "./data";
it("persists cards and FSRS history across independent database connections", async () => {
  const d = emptyData();
  d.decks = [
    {
      id: "storage-test",
      name: "Test",
      description: "",
      created: new Date().toISOString(),
    },
  ];
  d.cards = [newCard("storage-test", "mulțumesc", "merci")];
  const reviewed = grade(d, d.cards[0].id, Rating.Easy);
  await writeData(reviewed);
  const restored = await readData();
  expect(JSON.stringify(restored)).toEqual(JSON.stringify(reviewed));
  expect(restored.cards[0].schedule.due).toBeInstanceOf(Date);
  expect(restored.cards[0].schedule.last_review).toBeInstanceOf(Date);
});
it("replaces the collection with an imported empty backup", async () => {
  await writeData(emptyData());
  expect(await readData()).toEqual(emptyData());
});

async function inspectStorage() {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("bonjour-local", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<unknown[]>((resolve, reject) => {
      const request = db.transaction("app").objectStore("app").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function storeRaw(raw: unknown) {
  const db = await new Promise<IDBDatabase>(resolve => {
    const request = indexedDB.open("bonjour-local", 1);
    request.onsuccess = () => resolve(request.result);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("app", "readwrite");
      tx.objectStore("app").put(raw, "data");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}
function cloudFixture() {
  const data = emptyData();
  data.decks = [{id:"recovery-deck",name:"Luna 01",description:"",created:new Date().toISOString()}];
  data.cards = [newCard(data.decks[0].id,"un arbre","Traducere: un copac")];
  return grade(data,data.cards[0].id,Rating.Good);
}
const context = {userId:"test-user",reason:"Programare invalidă",hadUnsyncedChanges:true};

it("reads a legacy structured record as well as JSON without losing progress", async () => {
  const data = cloudFixture();
  await storeRaw(data);
  expect(JSON.stringify(await readData())).toBe(JSON.stringify(data));
});

it("archives unreadable local JSON before restoring cloud cards and SRS history", async () => {
  const damaged = '{"version":1,"cards":[';
  await storeRaw(damaged);
  await expect(readData()).rejects.toThrow();
  expect(await readLocalDataRaw()).toBe(damaged);
  const cloud = cloudFixture();
  await restoreLocalData(cloud,context);
  expect(JSON.stringify(await readData())).toBe(JSON.stringify(cloud));
  expect(await inspectStorage()).toContainEqual(expect.objectContaining({raw:damaged,...context}));
});

it("preserves unsynced reviews byte for byte even when local scheduling fails validation", async () => {
  const local = JSON.parse(JSON.stringify(cloudFixture()));
  local.cards[0].schedule.due = "invalid-date";
  const raw = JSON.stringify(local);
  await storeRaw(raw);
  await expect(readData()).rejects.toThrow("Programare invalidă");
  await restoreLocalData(cloudFixture(),context);
  expect(await inspectStorage()).toContainEqual(expect.objectContaining({raw,hadUnsyncedChanges:true}));
});

it("does not replace or archive local data when the cloud library is invalid", async () => {
  const original = JSON.stringify(cloudFixture());
  await storeRaw(original);
  const before = await inspectStorage();
  const invalid = {...cloudFixture(),decks:[]};
  await expect(restoreLocalData(invalid,context)).rejects.toThrow();
  expect(await readLocalDataRaw()).toBe(original);
  expect(await inspectStorage()).toEqual(before);
});

it("rolls back both the archive and replacement if the storage transaction aborts", async () => {
  const original = 'unreadable local content that must survive';
  await storeRaw(original);
  const before = await inspectStorage();
  const put = IDBObjectStore.prototype.put;
  const mock = vi.spyOn(IDBObjectStore.prototype,"put").mockImplementation(function(this: IDBObjectStore,value: unknown,key?: IDBValidKey) {
    const request = put.call(this,value,key);
    if (key === "data") this.transaction.abort();
    return request;
  });
  try {
    await expect(restoreLocalData(cloudFixture(),context)).rejects.toThrow("anulată");
  } finally {mock.mockRestore();}
  expect(await readLocalDataRaw()).toBe(original);
  expect(await inspectStorage()).toEqual(before);
});
