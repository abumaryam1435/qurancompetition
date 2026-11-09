export enum UserRole {
  SUPERVISOR = "supervisor",
  COMPETITION_EVALUATOR = "competition_evaluator",
}

export interface User {
  id: number;
  name: string;
  role: UserRole;
  competitionId?: string;
  updatedAt?: number;
}

export type ErrorCategoryColorKey =
  | 'rose'
  | 'teal'
  | 'amber'
  | 'purple'
  | 'blue'
  | 'emerald'
  | 'indigo'
  | 'orange';

export interface CompetitionErrorCategory {
  id: string;
  name: string;
  color: ErrorCategoryColorKey;
}

export interface CompetitionErrorType {
  id: number;
  name: string;
  deduction: number;
  category?: string;
  color?: ErrorCategoryColorKey;
}

export interface CompetitionLevel {
  id: number;
  name: string;
  juzsOrSurahs: string;
  juzCount?: number;
  isConsecutiveJuzs?: boolean;
  isUnspecifiedJuzs?: boolean;
  segmentsCount: number;
  linesPerSegment: number;
  errors: CompetitionErrorType[];
  errorCategories?: CompetitionErrorCategory[];
  maxScore: number;
}

export interface CompetitionEvaluator {
  id: number;
  name: string;
  pin?: string;
  levelIds: number[];
  allowedEditLevelIds?: number[];
}

export interface GlobalEvaluator {
  id: number;
  name: string;
  pin: string;
  notes?: string;
  createdAt?: number;
}

export interface CompetitionParticipant {
  id: number;
  name: string;
  levelId: number;
  juzsOrSurahs?: string;
  isUnmemorized?: boolean;
  passageSeed?: number;
  requestNumber?: string;
  civilId?: string;
  phone?: string;
  gender?: string;
  wilayat?: string;
  registrationDate?: string;
}

export interface CompetitionSegmentEvaluation {
  segmentNumber: number;
  errorsCount: Record<string, number>; // errorId -> count
  score: number;
  passageDescription?: string;
  isUnmemorized?: boolean;
}

export interface CompetitionEvaluation {
  id: number;
  participantId: number;
  evaluatorId: number;
  evaluatorName?: string;
  levelId: number;
  segments: CompetitionSegmentEvaluation[];
  totalScore: number;
  timestamp: number;
  notes?: string;
  isUnmemorized?: boolean;
}

export type PassageSelectionMode = 'random' | 'international' | 'manual';

export type PassageDifficultyTier = 'hard' | 'medium' | 'easy';

export interface ManualPassageRange {
  id: string;
  juzNumber: number;
  startSurahId: number;
  startAyah: number;
  endSurahId: number;
  endAyah: number;
  notes?: string;
}

export interface Competition {
  id: string;
  name: string;
  seasonText?: string;
  levels: CompetitionLevel[];
  errors?: CompetitionErrorType[];
  errorCategories?: CompetitionErrorCategory[];
  evaluators: CompetitionEvaluator[];
  participants: CompetitionParticipant[];
  evaluations: CompetitionEvaluation[];
  isActive: boolean;
  passageMode?: PassageSelectionMode;
  previewLinesPerSegment?: number;
  manualPassages?: ManualPassageRange[];
}

export interface FullBackupData {
  competitions?: Competition[];
  users?: User[];
  globalEvaluators?: GlobalEvaluator[];
  customLogo: string | null;
  supervisorPassword?: string;
  appName?: string;
  firebaseConfig?: any;
  configUpdatedAt?: number;
  isDistributable?: boolean;
  isPublishedConnected?: boolean;
}
