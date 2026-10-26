const roleMiddleware = (requiredRole) => {
  return (req, res, next) => {
    if (!req.user || req.user.role !== requiredRole) {
      return res.status(403).json({
        message: "Bạn không có quyền truy cập",
      });
    }

    next();
  };
};

module.exports = roleMiddleware;
