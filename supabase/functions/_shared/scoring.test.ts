import { test } from 'node:test';
import assert from 'node:assert/strict';
import { maxPayout, RULES, settleBet, stakeFor, validateBet, winnerGain, type BetInput, type MatchResult } from './scoring.ts';

const result = (over: Partial<MatchResult> = {}): MatchResult => ({
  status: 'finished',
  homeScore: 2,
  awayScore: 1,
  starterIds: ['mbappe', 'dembele', 'kolo'],
  scorerIds: ['dembele', 'kolo'],
  ...over,
});

const bet = (over: Partial<BetInput> = {}): BetInput => ({
  pick: 'home',
  odds: 1.5,
  exactScore: null,
  scorerIds: [],
  ...over,
});

test('vainqueur : gain = 10 × cote, arrondi', () => {
  assert.equal(winnerGain(1.5), 15);
  assert.equal(winnerGain(6), 60);
  assert.equal(winnerGain(1.83), 18);
  assert.equal(settleBet(bet(), result()).payout, 15);
  assert.equal(settleBet(bet({ pick: 'away' }), result()).payout, 0);
  assert.equal(settleBet(bet({ pick: 'draw', odds: 3.4 }), result({ homeScore: 1, awayScore: 1 })).payout, 34);
});

test('score exact : 5 engagés, mise rendue + 25 si trouvé', () => {
  assert.equal(stakeFor(bet({ exactScore: { home: 2, away: 1 } })), 5);
  assert.equal(settleBet(bet({ exactScore: { home: 2, away: 1 } }), result()).payout, 15 + 30);
  const lost = settleBet(bet({ exactScore: { home: 3, away: 1 } }), result());
  assert.equal(lost.payout, 15);
  assert.equal(lost.exactWon, false);
});

test('buteurs : trouvé = 30 rendus, raté = 0, remplaçant/absent = remboursé', () => {
  const s = settleBet(bet({ scorerIds: ['dembele', 'mbappe', 'remplacant'] }), result({ scorerIds: ['dembele', 'remplacant'] }));
  assert.deepEqual(s.scorers, [
    { playerId: 'dembele', outcome: 'won' },
    { playerId: 'mbappe', outcome: 'lost' },
    { playerId: 'remplacant', outcome: 'refunded' },
  ]);
  assert.equal(s.payout, 15 + 30 + 0 + 5);
});

test('match annulé : toutes les mises sont rendues', () => {
  const s = settleBet(bet({ exactScore: { home: 0, away: 0 }, scorerIds: ['a', 'b'] }), result({ status: 'cancelled' }));
  assert.equal(s.payout, 15);
  assert.equal(s.void, true);
});

test('gain maximum affiché', () => {
  assert.equal(maxPayout(bet({ exactScore: { home: 1, away: 0 }, scorerIds: ['a', 'b'] })), 15 + 30 + 60);
});

test('validation', () => {
  assert.equal(validateBet(bet(), 'football', 0), null);
  assert.match(validateBet(bet({ exactScore: { home: 1, away: 0 } }), 'football', 4)!, /5 points/);
  assert.match(validateBet(bet({ pick: 'draw' }), 'basketball', 20)!, /nul/);
  assert.match(validateBet(bet({ scorerIds: ['a'] }), 'basketball', 20)!, /NBA/);
  assert.match(validateBet(bet({ scorerIds: ['a', 'b', 'c', 'd'] }), 'football', 100)!, /maximum/);
  assert.match(validateBet(bet({ scorerIds: ['a', 'a'] }), 'football', 100)!, /deux fois/);
  assert.match(validateBet(bet({ odds: 0 }), 'football', 100)!, /cote/);
  assert.equal(RULES.startingPoints, 20);
});
