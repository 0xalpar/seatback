import test from "node:test";
import assert from "node:assert/strict";
import { cancellationSplit, validatePolicy, mayWithdraw, parseLamports, disputeDeadline } from "../packages/contracts/dist/index.js";
test("deadline boundaries and odd lamports preserve every lamport", () => {
  assert.deepEqual(cancellationSplit("101",9,10,20), {participant:"101",organizer:"0"});
  assert.deepEqual(cancellationSplit("101",10,10,20), {participant:"30",organizer:"71"});
  assert.deepEqual(cancellationSplit("101",19,10,20), {participant:"30",organizer:"71"});
  assert.deepEqual(cancellationSplit("101",20,10,20), {participant:"0",organizer:"101"});
  for(let amount=1;amount<=1000;amount++) {
    const split=cancellationSplit(String(amount),15,10,20);
    assert.equal(BigInt(split.participant)+BigInt(split.organizer),BigInt(amount));
  }
});
test("u64 parsing rejects float, negative and overflow", () => {
  for(const amount of ["-1","0.3","01","18446744073709551616"]) assert.throws(()=>parseLamports(amount));
  assert.equal(parseLamports("18446744073709551615"),18446744073709551615n);
});
const policy={depositLamports:"100",rule1Deadline:10,rule2Deadline:20,checkInOpensAt:30,
eventStartsAt:40,checkInClosesAt:50,eventEndsAt:60,disputeSeconds:86400};
test("policy rejects reversed rules and invalid times", () => {
  validatePolicy(policy);
  assert.throws(()=>validatePolicy({...policy,rule2Deadline:10}));
  assert.throws(()=>validatePolicy({...policy,checkInClosesAt:39}));
  assert.throws(()=>validatePolicy({...policy,disputeSeconds:3600}));
});
test("withdrawal waits for full dispute window and blocks unresolved disputes", () => {
  const deadline=disputeDeadline(50);
  assert.equal(mayWithdraw(deadline-1,50,60,0),false);
  assert.equal(mayWithdraw(deadline,50,60,1),false);
  assert.equal(mayWithdraw(deadline,50,60,0),true);
  assert.equal(mayWithdraw(deadline,50,deadline+100,0),false);
});
