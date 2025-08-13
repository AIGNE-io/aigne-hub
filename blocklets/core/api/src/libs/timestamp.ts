export const toUnixTimestamp = (date: Date | string | number): number => {
  return Math.floor(new Date(date).getTime() / 1000);
};

export const fromUnixTimestamp = (timestamp: number): Date => {
  return new Date(timestamp * 1000);
};

export const getDateUnixTimestamp = (dateString: string): number => {
  return Math.floor(new Date(`${dateString}T00:00:00.000Z`).getTime() / 1000);
};

export const getTodayString = (): string => {
  return new Date().toISOString().split('T')[0]!;
};

export const getCurrentUnixTimestamp = (): number => {
  return Math.floor(Date.now() / 1000);
};
