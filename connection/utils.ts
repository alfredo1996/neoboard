export const NotImplementedError = (functionName: string): never => {
  throw new Error(`Not Implemented: ${functionName}`);
};
