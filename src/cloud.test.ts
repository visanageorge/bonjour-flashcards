import { describe, expect, it } from "vitest";
import { createEmptyCard } from "ts-fsrs";
import type { SupabaseClient } from "@supabase/supabase-js";
import { emptyData, parseData, trackDeletions, grade, Rating, type Data } from "./data";
import { dataIsEmpty, isAuditedCatalog, loadCloudData, mergeData, saveCloudData } from "./cloud";
import { AUDITED_CATALOG_DECK_IDS } from "./catalog";

const library = (id: string, name: string): Data => ({
  ...emptyData(),
  decks: [{ id, name, description: "", created: "2026-01-01T00:00:00Z" }],
  cards: [
    {
      id: `card-${id}`,
      deckId: id,
      front: name,
      back: `${name}-back`,
      created: "2026-01-01T00:00:00Z",
      schedule: createEmptyCard(),
    },
  ],
});

function fakeCloud(data: Data, options: { cap?: number; count?: boolean; repeatPage?: boolean; stopAt?: number } = {}) {
  const records: Record<string, Record<string, unknown>[]> = {
    decks: data.decks.map(d=>({id:d.id,name:d.name,description:d.description,created_at:d.created,enabled:d.enabled??true})),
    cards: data.cards.map(c=>({id:c.id,deck_id:c.deckId,front:c.front,back:c.back,created_at:c.created,schedule:JSON.parse(JSON.stringify(c.schedule))})),
    reviews: data.reviews.map(r=>({id:r.id,card_id:r.cardId,deck_id:r.deckId,reviewed_at:r.at,rating:r.rating,was_new:r.wasNew,log:r.log})),
    templates: data.templates.map(t=>({id:t.id,name:t.name,front_prompt:t.frontPrompt,back_prompt:t.backPrompt,created_at:t.created})),
  };
  const ranges: number[] = [], batches: number[] = [];
  const deletions: {table:string;ids:string[]}[] = [];
  const deckWrites: Record<string,unknown>[] = [];
  const client = {
    from(table: string) {
      let start = 0, end = Infinity;
      const query = {
        select() {return query;}, eq() {return query;}, order() {return query;},
        range(from:number,to:number) {start=from;end=to;if(table==='cards')ranges.push(from);return query;},
        maybeSingle() {return Promise.resolve({data:{new_per_day:data.settings.newPerDay,retention:data.settings.retention},error:null});},
        then(resolve:(value:unknown)=>unknown) {
          const offset=options.repeatPage && table==='cards'?0:start;
          const page=table==='cards' && options.stopAt!==undefined && start>=options.stopAt ? [] : (records[table]??[]).slice(offset,Math.min(end+1,offset+(options.cap??1000)));
          return Promise.resolve({data:page,count:options.count===false?null:(records[table]??[]).length,error:null}).then(resolve);
        },
        upsert(value:Record<string,unknown> | Record<string,unknown>[]) {
          const rows=Array.isArray(value)?value:[value];
          if(table==='cards')batches.push(rows.length);
          if(table==='decks')deckWrites.push(...rows);
          if(table!=='user_settings') {
            const merged=new Map((records[table]??[]).map(row=>[row.id,row]));
            for(const row of rows)merged.set(row.id,{...merged.get(row.id),...row});
            records[table]=[...merged.values()];
          }
          return Promise.resolve({error:null});
        },
        delete() {return query;},
        in(_column:string,ids:string[]) {
          deletions.push({table,ids});
          records[table]=records[table].filter(row=>!ids.includes(row.id as string));
          return Promise.resolve({error:null});
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return {client,records,ranges,batches,deckWrites,deletions};
}
function largeLibrary(count=2728) {
  const data=library('deck','Franceză');
  data.cards=Array.from({length:count},(_,i)=>({...data.cards[0],id:`card-${i}`,front:`mot ${i}`}));
  return data;
}

describe("cloud first sync", () => {
  it("detects a library without decks and cards as empty", () => {
    expect(dataIsEmpty(emptyData())).toBe(true);
    expect(dataIsEmpty(library("local", "Local"))).toBe(false);
    const templateOnly = emptyData();
    templateOnly.templates.push({
      id: "template",
      name: "AI",
      frontPrompt: "Front",
      backPrompt: "Back",
      created: "2026-01-01T00:00:00Z",
    });
    expect(dataIsEmpty(templateOnly)).toBe(false);
  });

  it("keeps records from both cloud and local libraries", () => {
    const merged = mergeData(
      library("cloud", "Cloud"),
      library("local", "Local"),
    );

    expect(merged.decks.map((deck) => deck.id)).toEqual(["cloud", "local"]);
    expect(merged.cards).toHaveLength(2);
  });

  it("prefers the local copy when the same record exists", () => {
    const merged = mergeData(
      library("same", "Versiunea cloud"),
      library("same", "Versiunea locală"),
    );

    expect(merged.decks).toHaveLength(1);
    expect(merged.decks[0].name).toBe("Versiunea locală");
  });
});

describe("large cloud libraries", () => {
  it("recognizes all six imported monthly decks even after later additions", () => {
    const data = emptyData();
    data.decks = Array.from({ length: 6 }, (_, index) => ({
      id: AUDITED_CATALOG_DECK_IDS[index],
      name: `Luna ${String(index + 1).padStart(2, "0")}`,
      description: "Catalog auditat",
      created: "2026-01-01T00:00:00Z",
    }));
    expect(isAuditedCatalog(data)).toBe(true);
    data.decks.push({ id: "later", name: "Extra", description: "", created: "2026-01-01T00:00:00Z" });
    expect(isAuditedCatalog(data)).toBe(true);
    data.decks[4].description = "";
    data.decks[4].name = "Nume personalizat";
    expect(isAuditedCatalog(data)).toBe(true);
    data.decks.splice(4,1);
    expect(isAuditedCatalog(data)).toBe(false);
  });
  it("loads every page instead of truncating at the Supabase row limit", async () => {
    const data = largeLibrary();
    data.decks[0].enabled = false;
    const server=fakeCloud(data);
    const loaded = await loadCloudData(server.client, "user");
    expect(loaded?.cards).toHaveLength(2728);
    expect(loaded?.decks[0].enabled).toBe(false);
    expect(server.ranges).toEqual([0, 1000, 2000]);
  });

  it("saves large card sets in bounded batches", async () => {
    const data = library("deck", "Franceză");
    data.decks[0].enabled = false;
    data.decks.push({id:"default-on",name:"Luna 02",description:"",created:"2026-01-01T00:00:00Z"});
    data.cards = Array.from({ length: 405 }, (_, index) => ({
      ...data.cards[0],
      id: `card-${index}`,
      front: `mot ${index}`,
    }));
    const server=fakeCloud(emptyData());
    await saveCloudData(server.client, "user", data);
    expect(server.batches).toEqual([200, 200, 5]);
    expect(server.deckWrites.map(deck=>deck.enabled)).toEqual([false,true]);
  });
  it("continues after short pages when the server cap is lower than the requested range", async () => {
    const server=fakeCloud(largeLibrary(1205),{cap:400});
    expect((await loadCloudData(server.client,'user'))?.cards).toHaveLength(1205);
    expect(server.ranges).toEqual([0,400,800,1200]);
  });
  it("continues to an empty page when the server does not return a count", async () => {
    const server=fakeCloud(largeLibrary(1205),{cap:400,count:false});
    expect((await loadCloudData(server.client,'user'))?.cards).toHaveLength(1205);
    expect(server.ranges).toEqual([0,400,800,1200,1205]);
  });
  it("refuses a truncated or repeated response before writing any records", async () => {
    for(const options of [{stopAt:1000},{repeatPage:true}]) {
      const server=fakeCloud(largeLibrary(),options);
      await expect(saveCloudData(server.client,'user',largeLibrary(1000))).rejects.toThrow();
      expect(server.batches).toEqual([]);
      expect(server.deletions).toEqual([]);
    }
  });
  it("repairs a 1000-card local copy without deleting the other 1728 cloud cards or losing a new review", async () => {
    const cloud=largeLibrary();
    const local=grade({...cloud,cards:cloud.cards.slice(0,1000)},cloud.cards[0].id,Rating.Good);
    local.decks[0]={...local.decks[0],enabled:false};
    const server=fakeCloud(cloud);
    const result=await saveCloudData(server.client,'user',local);
    expect(result.cards).toHaveLength(2728);
    expect(server.records.cards).toHaveLength(2728);
    expect(result.reviews).toHaveLength(1);
    expect(result.cards[0].schedule.reps).toBe(1);
    expect(result.decks[0].enabled).toBe(false);
    expect(server.deletions).toEqual([]);
  });
  it("still synchronizes deliberate card deletions and their review removal", async () => {
    const cloud=grade(largeLibrary(3),'card-0',Rating.Good);
    const removed=trackDeletions(cloud,{...cloud,cards:cloud.cards.slice(1),reviews:[]});
    const offline=parseData(JSON.parse(JSON.stringify(removed)));
    const server=fakeCloud(cloud);
    const result=await saveCloudData(server.client,'user',offline);
    expect(result.cards).toHaveLength(2);
    expect(server.records.cards.map(row=>row.id)).toEqual(['card-1','card-2']);
    expect(server.records.reviews).toEqual([]);
    expect(server.deletions).toEqual([{table:'reviews',ids:[cloud.reviews[0].id]},{table:'cards',ids:['card-0']}]);
  });
  it("does not infer deletions from an empty or partial local library", async () => {
    const server=fakeCloud(largeLibrary(15));
    expect((await saveCloudData(server.client,'user',emptyData())).cards).toHaveLength(15);
    expect(server.deletions).toEqual([]);
  });
});
