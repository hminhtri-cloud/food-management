const createSwaggerSpec = require("./createSwaggerSpec");
const addWorkflowSpec = require("./workflowSpec");

module.exports = addWorkflowSpec(createSwaggerSpec("Food Management - User API", ["*.js"]));
