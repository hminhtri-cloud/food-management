const path = require("node:path");
const swaggerJSDoc = require("swagger-jsdoc");

const createSwaggerSpec = (title, routeFiles) => swaggerJSDoc({
  failOnErrors: true,
  definition: {
    openapi: "3.0.0",
    info: { title, version: "1.0.0", description: title },
    servers: [{ url: "/" }],
    components: {
      securitySchemes: {
        bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      },
    },
  },
  apis: routeFiles.map((file) => path.resolve(__dirname, "../routes", file)),
});

module.exports = createSwaggerSpec;
