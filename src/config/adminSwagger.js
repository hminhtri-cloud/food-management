const createSwaggerSpec = require("./createSwaggerSpec");
const addManagementSpec = require("./adminManagementSpec");

module.exports = addManagementSpec(createSwaggerSpec("Food Management - Admin API", ["admin/*.js", "healthRoutes.js"]));
