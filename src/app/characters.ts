export type Filiere = 'SLAM' | 'SISR';

export interface Stats {
  code: number;
  reseau: number;
  secu: number;
  vitesse: number;
}

export interface Character {
  id: string;
  name: string;
  filiere: Filiere;
  /** Couleur principale (tee-shirt / corps) */
  color: number;
  /** Couleur secondaire (cheveux / accents) */
  accent: number;
  /** Petite bio affichée dans le menu */
  role: string;
  /** Réplique de l'histoire (dialogue en jeu) */
  line: string;
  /** Nom du pouvoir / spécialité */
  powerName: string;
  /** Description du pouvoir */
  powerDesc: string;
  /** Stats 0-100 pour les barres du menu */
  stats: Stats;
  /** Teint de peau explicite (sinon dérivé de l'id) */
  skin?: number;
  /** Morphologie du modèle 3D voxel */
  build?: 'normal' | 'obese';
  /** PNJ uniquement : plaçable dans l'éditeur mais non jouable (absent du menu) */
  npcOnly?: boolean;
}

export const CHARACTERS: Character[] = [
  {
    id: 'allan',
    name: 'Allan',
    filiere: 'SLAM',
    color: 0x3b82f6,
    accent: 0x1e3a8a,
    role: 'Développeur SLAM — code plus vite que son ombre.',
    line: 'Mon appli compile enfin... 3 minutes avant la soutenance. On y va !',
    powerName: 'Compilation Express',
    powerDesc: 'Pousse du code fonctionnel en un temps record, zéro erreur au build.',
    stats: { code: 95, reseau: 40, secu: 50, vitesse: 85 },
  },
  {
    id: 'manley',
    name: 'Manley',
    filiere: 'SLAM',
    color: 0x14b8a6,
    accent: 0x0f766e,
    role: 'Développeur SLAM — architecte du back-end.',
    line: 'J\'ai poussé le back sur le serveur cette nuit. Tout est prêt, promis.',
    powerName: 'Architecte Back-End',
    powerDesc: 'Conçoit des API robustes qui ne tombent jamais en prod.',
    stats: { code: 90, reseau: 45, secu: 65, vitesse: 70 },
  },
  {
    id: 'pierro',
    name: 'Pierro',
    filiere: 'SISR',
    color: 0xef4444,
    accent: 0x991b1b,
    role: 'Admin SISR — maître des réseaux.',
    line: 'Le réseau de l\'amphi est nickel, j\'ai vérifié tous les switchs.',
    powerName: 'Maître des Réseaux',
    powerDesc: 'Voit tout le trafic et optimise chaque paquet à la volée.',
    stats: { code: 40, reseau: 95, secu: 80, vitesse: 70 },
  },
  {
    id: 'louis',
    name: 'Louis',
    filiere: 'SISR',
    color: 0x22c55e,
    accent: 0x166534,
    role: 'Admin SISR — dompteur de serveurs.',
    line: 'Les VM tournent. Si ça plante pendant ta démo, c\'est pas moi !',
    powerName: 'Dompteur de Serveurs',
    powerDesc: 'Garde les serveurs en ligne quoi qu\'il arrive, 99,9% uptime.',
    stats: { code: 45, reseau: 85, secu: 75, vitesse: 65 },
  },
  {
    id: 'lenzo',
    name: 'Lenzo',
    filiere: 'SISR',
    color: 0xf97316,
    accent: 0x9a3412,
    role: 'Admin SISR — gardien du firewall.',
    line: 'J\'ai ouvert le bon port sur le firewall pour le diapo en ligne.',
    powerName: 'Bouclier Firewall',
    powerDesc: 'Bloque toute intrusion avant même qu\'elle n\'atteigne le réseau.',
    stats: { code: 35, reseau: 80, secu: 95, vitesse: 60 },
  },
  {
    id: 'romain',
    name: 'Romain',
    filiere: 'SISR',
    color: 0xa855f7,
    accent: 0x6b21a8,
    role: 'Admin SISR — roi du câble RJ45.',
    line: 'J\'ai re-serti douze câbles RJ45 ce matin. DOUZE ! On est parés.',
    powerName: 'Roi du RJ45',
    powerDesc: 'Sertit et câble à la vitesse de l\'éclair, jamais un faux contact.',
    stats: { code: 30, reseau: 90, secu: 70, vitesse: 90 },
  },
  {
    id: 'elodie',
    name: 'Élodie',
    filiere: 'SISR',
    color: 0xec4899,
    accent: 0x9d174d,
    role: 'Admin SISR — reine de la virtualisation.',
    line: 'J\'ai cloné l\'environnement, tu peux faire ta démo sans stresser.',
    powerName: 'Reine de la Virtu',
    powerDesc: 'Clone et déploie des machines virtuelles en un clin d\'œil.',
    stats: { code: 55, reseau: 88, secu: 78, vitesse: 75 },
  },
  {
    id: 'imran',
    name: 'Imran',
    filiere: 'SISR',
    color: 0xeab308,
    accent: 0x854d0e,
    role: 'Admin SISR — as du dépannage.',
    line: 'Un souci ? Je débugue en deux minutes. Allez, direction l\'amphi !',
    powerName: 'Debug Instantané',
    powerDesc: 'Diagnostique et répare n\'importe quelle panne en deux minutes.',
    stats: { code: 60, reseau: 82, secu: 80, vitesse: 95 },
  },
  // --- trio « rivalité » (façon Mario / Bowser / Peach) ---
  {
    id: 'marius',
    name: 'Yorann',
    filiere: 'SLAM',
    color: 0xdc2626,
    accent: 0x7f1d1d,
    skin: 0xffe0c2,
    build: 'obese',
    npcOnly: true,
    role: 'Développeur SLAM — le gros cœur de la promo.',
    line:
      'Joey a encore enlevé Raphaël et l\'a enfermé dans la salle voisine ! ' +
      'Lui et moi c\'est une vieille rivalité... Je vais le récupérer, foi de Yorann !',
    powerName: 'Charge Héroïque',
    powerDesc: 'Fonce tête baissée pour récupérer Raphaël, rien ne l\'arrête.',
    stats: { code: 80, reseau: 45, secu: 55, vitesse: 40 },
  },
  {
    id: 'brutus',
    name: 'Joey',
    filiere: 'SISR',
    color: 0x4b5563,
    accent: 0x111827,
    skin: 0xd9a06b,
    build: 'obese',
    npcOnly: true,
    role: 'Admin SISR — le gros bras qui a kidnappé Raphaël.',
    line:
      'Ha ! Raphaël est à MOI maintenant, je l\'ai planqué en lieu sûr. ' +
      'Si ce bouffon de Yorann le veut, il devra me passer dessus !',
    powerName: 'Prise de Catch',
    powerDesc: 'Verrouille n\'importe qui (ou n\'importe quoi) et refuse de lâcher.',
    stats: { code: 35, reseau: 70, secu: 90, vitesse: 30 },
  },
  {
    id: 'raphael',
    name: 'Raphaël',
    filiere: 'SLAM',
    color: 0xf9a8d4,
    accent: 0xbe185d,
    npcOnly: true,
    role: 'Développeur SLAM — la cible préférée de Joey.',
    line:
      'Au secours... Joey m\'a encore embarqué ! Yorann, j\'espère que tu vas venir me sauver, ' +
      'comme la dernière fois...',
    powerName: 'Appel à l\'Aide',
    powerDesc: 'Toujours capturé, mais inspire ses amis à se dépasser pour le sauver.',
    stats: { code: 75, reseau: 50, secu: 40, vitesse: 65 },
  },
  // --- camarades supplémentaires (PNJ uniquement, non jouables) ---
  {
    id: 'nathan',
    name: 'Nathan',
    filiere: 'SLAM',
    color: 0x6366f1,
    accent: 0x1e1b2e,
    skin: 0xf0c8a0,
    npcOnly: true,
    role: 'Développeur SLAM — fan de K-dramas et de clean code.',
    line: 'J\'ai codé toute la nuit en écoutant de la K-pop, le module est nickel !',
    powerName: 'Refactor Express',
    powerDesc: 'Transforme un code spaghetti en architecture propre en un clin d\'œil.',
    stats: { code: 92, reseau: 42, secu: 55, vitesse: 80 },
  },
  {
    id: 'weimin',
    name: 'Weimin',
    filiere: 'SLAM',
    color: 0x06b6d4,
    accent: 0x0b1f29,
    skin: 0xe8bd92,
    npcOnly: true,
    role: 'Développeur SLAM — roi des algorithmes.',
    line: 'Mon algo tourne en O(log n) — même Joey n\'arrive pas à le ralentir.',
    powerName: 'Optimisation Algébrique',
    powerDesc: 'Trouve la complexité optimale de n\'importe quel algorithme.',
    stats: { code: 95, reseau: 45, secu: 60, vitesse: 78 },
  },
  {
    id: 'mickael',
    name: 'Mickaël',
    filiere: 'SLAM',
    color: 0x84cc16,
    accent: 0x1a2e0a,
    skin: 0x5b3a24,
    npcOnly: true,
    role: 'Développeur SLAM — toujours zen.',
    line: 'Pas de stress, on livre le projet à temps — comme sur les plages de chez moi.',
    powerName: 'Sang-Froid Absolu',
    powerDesc: 'Garde son calme et débogue sereinement même la veille du rendu.',
    stats: { code: 84, reseau: 50, secu: 58, vitesse: 70 },
  },
  {
    id: 'jiji',
    name: 'Jiji',
    filiere: 'SLAM',
    color: 0xd97706,
    accent: 0x2b1a0a,
    skin: 0x4a2f1c,
    npcOnly: true,
    role: 'Développeur SLAM — codeur du Caillou.',
    line: 'Le front-end est prêt, j\'y ai mis toutes les couleurs du pays !',
    powerName: 'Interface Soleil',
    powerDesc: 'Conçoit des interfaces chaleureuses qui mettent tout le monde d\'accord.',
    stats: { code: 86, reseau: 48, secu: 52, vitesse: 82 },
  },
  {
    id: 'jojo',
    name: 'Jojo',
    filiere: 'SISR',
    color: 0x8b5cf6,
    accent: 0x1e1733,
    skin: 0x4e3320,
    npcOnly: true,
    role: 'Admin SISR — gardien du réseau du Caillou.',
    line: 'Le réseau tient bon, j\'ai vérifié chaque câble du bâtiment ce matin.',
    powerName: 'Veille Réseau',
    powerDesc: 'Surveille tout le réseau et coupe court à la moindre panne.',
    stats: { code: 42, reseau: 92, secu: 84, vitesse: 68 },
  },
  // --- classe BTS SIO (PNJ uniquement) ---
  {
    id: 'emmanuelle-vagner', name: 'Emmanuelle VAGNER', filiere: 'SLAM',
    color: 0x9333ea, accent: 0x581c87, npcOnly: true,
    role: 'Développeuse SLAM — créatrice d\'UI.',
    line: 'J\'ai refait la maquette, c\'est beau ET ergonomique.',
    powerName: 'Design Express', powerDesc: 'Transforme une interface terne en chef-d\'œuvre clair.',
    stats: { code: 84, reseau: 44, secu: 52, vitesse: 86 },
  },
  {
    id: 'araceli-ceron', name: 'Araceli CERON CAYUELA', filiere: 'SISR',
    color: 0xf59e0b, accent: 0x92400e, skin: 0xe0ac8b, npcOnly: true,
    role: 'Admin SISR — polyglotte des serveurs.',
    line: 'Les sauvegardes tournent toutes les nuits, sin problema.',
    powerName: 'Backup Total', powerDesc: 'Sauvegarde et restaure n\'importe quel système sans perte.',
    stats: { code: 46, reseau: 88, secu: 86, vitesse: 66 },
  },
  {
    id: 'sherryl-tauraatua', name: 'Sherryl TAURAATUA', filiere: 'SLAM',
    color: 0xec4899, accent: 0x9d174d, skin: 0xc68642, npcOnly: true,
    role: 'Développeuse SLAM — fan de mobile.',
    line: 'L\'appli tourne nickel sur mon téléphone, regarde !',
    powerName: 'Build Mobile', powerDesc: 'Porte n\'importe quelle appli sur mobile en un clin d\'œil.',
    stats: { code: 86, reseau: 48, secu: 54, vitesse: 84 },
  },
  {
    id: 'wasso-wahuzue', name: 'Wasso WAHUZUE', filiere: 'SISR',
    color: 0xea580c, accent: 0x7c2d12, skin: 0x6b4226, npcOnly: true,
    role: 'Admin SISR — maître du câblage.',
    line: 'La baie est rangée au cordeau, chaque câble étiqueté.',
    powerName: 'Câblage Zen', powerDesc: 'Organise la baie réseau pour que rien ne soit jamais débranché par erreur.',
    stats: { code: 40, reseau: 92, secu: 78, vitesse: 72 },
  },
  {
    id: 'josias-wassaumi', name: 'Josias WASSAUMI', filiere: 'SLAM',
    color: 0x0d9488, accent: 0x134e4a, skin: 0x6b4226, npcOnly: true,
    role: 'Développeur SLAM — architecte logiciel.',
    line: 'Mon code est modulaire, tu peux tout réutiliser.',
    powerName: 'Architecture Solide', powerDesc: 'Conçoit des structures de code propres et évolutives.',
    stats: { code: 89, reseau: 50, secu: 62, vitesse: 70 },
  },
  {
    id: 'jean-robert-henaff', name: 'Jean ROBERT-HENAFF', filiere: 'SISR',
    color: 0x64748b, accent: 0x1e293b, npcOnly: true,
    role: 'Admin SISR — gardien de la sécurité.',
    line: 'Mots de passe forts, pare-feu à jour : on est blindés.',
    powerName: 'Forteresse', powerDesc: 'Verrouille le réseau contre toute intrusion.',
    stats: { code: 44, reseau: 84, secu: 94, vitesse: 64 },
  },
  {
    id: 'tyron-hanui', name: 'Tyron HANUI', filiere: 'SLAM',
    color: 0xca8a04, accent: 0x713f12, skin: 0x8d5524, npcOnly: true,
    role: 'Développeur SLAM — rapide comme l\'éclair.',
    line: 'J\'ai fini ma fonctionnalité, je passe à la suivante.',
    powerName: 'Sprint Final', powerDesc: 'Boucle ses tâches plus vite que prévu, toujours en avance.',
    stats: { code: 85, reseau: 46, secu: 50, vitesse: 92 },
  },
  {
    id: 'malaury-mounien', name: 'Malaury MOUNIEN', filiere: 'SISR',
    color: 0xa855f7, accent: 0x6b21a8, skin: 0x8d5524, npcOnly: true,
    role: 'Admin SISR — as du dépannage.',
    line: 'Un poste qui rame ? Je le remets d\'aplomb en deux minutes.',
    powerName: 'SOS Express', powerDesc: 'Diagnostique et répare n\'importe quel poste en un rien de temps.',
    stats: { code: 47, reseau: 85, secu: 80, vitesse: 88 },
  },
  {
    id: 'urielle-zimmerlin', name: 'Urielle ZIMMERLIN', filiere: 'SLAM',
    color: 0xe11d48, accent: 0x881337, npcOnly: true,
    role: 'Développeuse SLAM — experte base de données.',
    line: 'Ma requête SQL sort le résultat avant que tu aies cliqué.',
    powerName: 'Requête Éclair', powerDesc: 'Optimise les bases de données pour des réponses instantanées.',
    stats: { code: 87, reseau: 52, secu: 66, vitesse: 78 },
  },
  {
    id: 'loimata-tokava', name: 'Loimata TOKAVA', filiere: 'SLAM',
    color: 0xf97316, accent: 0x9a3412, skin: 0x6b4226, npcOnly: true,
    role: 'Développeur SLAM — esprit d\'équipe.',
    line: 'On code mieux à plusieurs — viens, on s\'entraide !',
    powerName: 'Pair Programming', powerDesc: 'Booste toute l\'équipe en codant à deux sur les morceaux difficiles.',
    stats: { code: 83, reseau: 50, secu: 56, vitesse: 80 },
  },
];

export function cssColor(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}
