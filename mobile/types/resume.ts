/**
 * Types for the central Resume Tailoring API (server: /api/resume/*). The
 * mobile app holds NO tailoring logic — these mirror what the backend returns.
 */

export type MatchState = 'MATCHED' | 'PARTIAL_MATCH' | 'NOT_FOUND';
export type RequirementType = 'required' | 'mentioned' | 'preferred';
export type ChangeStatus = 'pending' | 'accepted' | 'rejected';
export type VersionStatus = 'draft' | 'approved' | 'rejected';
export type ReviewDecision = 'accepted' | 'rejected' | 'pending';
export type ApproveAction = 'accept_all' | 'reject_all' | 'review';

export interface EvidenceFact {
  factId: string;
  text: string;
  sourcePath: string;
  kind?: string;
}

export interface ResumeRequirement {
  id: string;
  requirement: string;
  canonical: string | null;
  recognized: boolean;
  type: RequirementType;
  state: MatchState;
  /** Human label, e.g. "Missing / Not found in your profile". */
  label: string;
  strength: 'demonstrated' | 'listed' | 'related' | 'none';
  note: string;
  relatedTerms: string[];
  evidence: EvidenceFact[];
}

export interface AtsCheck {
  id: string;
  label: string;
  status: 'pass' | 'warn' | 'fail';
  detail: string;
}

export interface Recommendation {
  type: string;
  requirement?: string;
  message: string;
}

export interface UnsupportedClaim {
  unitId: string;
  section: string;
  original: string;
  proposed: string;
  violations: { code: string; detail: string }[];
}

export interface MatchAnalysis {
  analysisId?: number;
  jobKey: string;
  jd: {
    title: string;
    company: string;
    location: string | null;
    employmentType: string | null;
    description: string;
  };
  matchScore: number | null;
  requirements: ResumeRequirement[];
  matchedSkills: string[];
  strongMatches: string[];
  partialSkills: string[];
  missingSkills: string[];
  recommendations: Recommendation[];
  ats: { score: number; checks: AtsCheck[] };
  reviewManually: { experience: string[]; education: string[]; note: string };
  warnings: string[];
}

export interface ResumeChange {
  id: string;
  section: 'summary' | 'experience' | 'projects' | 'skills';
  op: 'reorder' | 'rewrite';
  original: string;
  proposed: string;
  reason: string;
  source: 'deterministic' | 'ai';
  status: ChangeStatus;
  evidence: EvidenceFact[];
}

export interface TailoredVersion {
  id: number;
  label: string;
  status: VersionStatus;
  targetCompany: string;
  targetTitle: string;
  jobKey: string;
  jdHash: string;
  matchScore: number | null;
  aiUsed: boolean;
  createdAt: string;
  approvedAt: string | null;
  analysis: MatchAnalysis;
  unsupportedClaims: UnsupportedClaim[];
  recommendations: Recommendation[];
  warnings: string[];
  resumeText: string;
  changes: ResumeChange[];
}

export interface VersionSummary {
  id: number;
  label: string;
  status: VersionStatus;
  targetCompany: string;
  targetTitle: string;
  jobKey: string;
  matchScore: number | null;
  changeCount: number;
  acceptedCount: number;
  aiUsed: boolean;
  createdAt: string;
  approvedAt: string | null;
}

export interface VersionList {
  original: { id: 'original'; label: string; sourceType: string; fileName: string | null; createdAt: string } | null;
  versions: VersionSummary[];
}

export interface CurrentResume {
  resume: { id: number; label: string; sourceType: string; fileName: string | null; createdAt: string } | null;
  reason?: string;
  message?: string;
}

export interface TailoringSession {
  id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  stage: string;
  stageLabel: string;
  versionId: number | null;
  error: string | null;
  errorCode: string | null;
  warnings: string[];
}

/** The `job` the API accepts: exactly one of trackedJobId / engineJobId / description. */
export interface ResumeJobInput {
  trackedJobId?: number;
  engineJobId?: number;
  title?: string;
  company?: string;
  location?: string | null;
  description?: string;
  sourceName?: string | null;
}
