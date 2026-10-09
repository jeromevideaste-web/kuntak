import { Text } from 'react-native';
import { RULES } from '@shared/scoring';
import { Card, Muted, Screen } from '@/components/ui';
import { colors } from '@/theme';

const R = RULES;

const SECTIONS: [string, string][] = [
  ['🎯 Objectif', `Chaque joueur démarre avec ${R.startingPoints} points. Le premier à atteindre ${R.targetPoints} points remporte la partie.`],
  [
    '🏆 Pari vainqueur',
    `Pour chaque match, choisis le vainqueur (ou le nul au foot). Il ne coûte rien. S'il est bon, tu gagnes ${R.winnerMultiplier} × la cote. Exemple : une cote de 1,50 rapporte 15 points, une cote de 6,00 rapporte 60 points.`,
  ],
  [
    '🎯 Bonus score exact (football)',
    `Il engage ${R.exactScoreStake} points. Si le score est exact à la fin du temps réglementaire, tu récupères ta mise + ${R.exactScoreBonus} points. Sinon, la mise est perdue.`,
  ],
  [
    '⚽ Bonus buteurs (football)',
    `Chaque buteur engage ${R.scorerStake} points (${R.maxScorers} maximum par match). S'il marque, tu récupères ta mise + ${R.scorerBonus} points. Les buts contre son camp et ceux marqués en prolongation ne comptent pas. Si le joueur ne joue pas ou n'est pas titulaire, ta mise est remboursée.`,
  ],
  ['🏀 NBA', 'Seul le pari vainqueur est proposé (prolongations comprises). Pas de match nul.'],
  ['📊 Les cotes', 'Les cotes proviennent des principaux sites de paris sportifs (valeur médiane). Elles sont figées au moment où tu valides ton pari.'],
  ['🤫 Pas de copie', "Les paris de tes amis sont visibles seulement après le coup d'envoi. Un pari validé ne peut plus être modifié."],
  ['❌ Match annulé ou reporté', 'Toutes les mises sont rendues.'],
  ['💶 Aucun argent', 'StbSports est un jeu entre amis : aucun argent réel ne peut être misé, acheté ou gagné.'],
];

export default function Rules() {
  return (
    <Screen>
      {SECTIONS.map(([title, body]) => (
        <Card key={title}>
          <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>{title}</Text>
          <Muted style={{ lineHeight: 20 }}>{body}</Muted>
        </Card>
      ))}
    </Screen>
  );
}
