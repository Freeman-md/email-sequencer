export type ProspectContact = {
  id: string;
  name: string;
  email: string;
  company: string;
  doNotContact: boolean;
};
export type ProspectContext = ProspectContact & {
  role: string;
  campaignIds: string[];
  interactionIds: string[];
  signal: string;
  sources: string;
  qualificationNotes: string;
};

export type ProspectQueueContext = ProspectContact & {
  interactionIds: string[];
};
