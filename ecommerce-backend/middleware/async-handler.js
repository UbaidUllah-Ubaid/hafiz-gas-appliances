export default function asyncHandler(handler, onError) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(error => {
      if (onError) {
        onError(error, req, res, next);
      } else {
        next(error);
      }
    });
  };
}
