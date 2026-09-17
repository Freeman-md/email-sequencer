export type Campaign = {
  id: string;
  name: string;
  guidance: {
    icp: string;
    buyerRoles: string[];
    geography: string[];
    companyCriteria: string;
    exclusionCriteria: string;
    coreProblem: string;
    triggers: string;
    offer: string;
    desiredNextStep: string;
    notes: string;
  };
};
