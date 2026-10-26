/** Copy vocabulary into a new account, never its source account's learning state. */
import {createHash} from 'node:crypto';
import {newCard,parseData} from '../src/data.ts';

export function accountRecordId(userId,kind,sourceId) {
  const bytes=createHash('sha256').update(`bonjour-account-library-v1:${userId}:${kind}:${sourceId}`).digest().subarray(0,16);
  bytes[6]=(bytes[6]&15)|80;
  bytes[8]=(bytes[8]&63)|128;
  const h=bytes.toString('hex');
  return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function cloneAccountLibrary(source,targetUserId,created=new Date()) {
  if(targetUserId===source.user.id)throw Error('Source and target accounts must differ');
  const deckMap=new Map(source.decks.map(d=>[d.id,accountRecordId(targetUserId,'deck',d.id)]));
  const data=parseData({
    version:1,
    decks:source.decks.map((d,index)=>({id:deckMap.get(d.id),name:d.name,description:d.description,enabled:d.enabled!==false,created:new Date(+created+index).toISOString()})),
    cards:source.cards.map(c=>{
      const card=newCard(deckMap.get(c.deck_id),c.front,c.back);
      return {...card,id:accountRecordId(targetUserId,'card',c.id),created:created.toISOString(),schedule:{...card.schedule,due:created}};
    }),
    reviews:[],
    templates:source.templates.map(t=>({id:accountRecordId(targetUserId,'template',t.id),name:t.name,frontPrompt:t.front_prompt,backPrompt:t.back_prompt,created:created.toISOString()})),
    settings:{newPerDay:15,retention:Number(source.settings[0]?.retention??0.9)},
  });
  if(new Set(data.cards.map(c=>c.id)).size!==source.cards.length)throw Error('Duplicate source cards');
  return data;
}
