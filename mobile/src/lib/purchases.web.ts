// The web build of the mobile app (used for testing) has no app stores.
export type StorePlan = { id: string; title: string; price: string; pkg: unknown };
export const storePurchasesAvailable = () => false;
export const storePlans = async (_userId: string): Promise<StorePlan[]> => [];
export const buyPlan = async (_userId: string, _plan: StorePlan) => false;
export const restorePurchases = async (_userId: string) => {};
