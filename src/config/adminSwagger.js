const createSwaggerSpec = require("./createSwaggerSpec");

module.exports = createSwaggerSpec("Food Management - Admin API", ["admin/*.js", "healthRoutes.js"]);
