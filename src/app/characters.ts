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
];

export function cssColor(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}
