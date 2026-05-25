export const asyncHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    next(error); // This will catch errors from sync fn throws and async fn rejections
  }
};
