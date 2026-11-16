// Định nghĩa OpenAPI cho 21 endpoint quản trị; không phụ thuộc kết nối database.
module.exports = (spec) => {
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
  const integer = { type: "integer", minimum: 1, maximum: 2147483647 };
  const string = (maxLength) => ({ type: "string", minLength: 1, maxLength });
  const object = (properties, required = []) => ({ type: "object", properties, ...(required.length ? { required } : {}) });
  const array = (items) => ({ type: "array", items });
  const counts = (names) => Object.fromEntries(names.map((name) => [name, { type: "integer", minimum: 0 }]));
  const region = { name: string(50) };
  const ingredient = { name: string(150), categoryId: { ...integer, nullable: true }, defaultUnit: { ...string(30), nullable: true } };
  const recipeIngredient = object({ ingredientId: integer, quantity: { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 99999999.99, multipleOf: 0.01 }, unit: string(30) }, ["ingredientId", "quantity", "unit"]);
  const recipe = {
    slug: { ...string(150), pattern: "^[a-z0-9]+(?:-[a-z0-9]+)*$" }, name: string(200), regionId: integer,
    imageUrl: { type: "string", format: "uri", nullable: true }, sourceUrl: { type: "string", format: "uri" },
    ingredients: { ...array(recipeIngredient), minItems: 1, maxItems: 200 },
  };
  const user = object({ id: integer, email: { type: "string", nullable: true }, phone: { type: "string", nullable: true },
    fullName: { type: "string", nullable: true }, avatarUrl: { type: "string", nullable: true },
    role: { type: "string", enum: ["USER", "ADMIN"] }, status: { type: "string", enum: ["ACTIVE", "LOCKED", "DELETED"] },
    createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } });
  const aiMetrics = counts(["calls", "successCalls", "errorCalls", "uniqueUsers", "inputTokens", "outputTokens"]);
  const recipeMetrics = counts(["views", "recommendations"]);
  spec.components.schemas = {
    ...spec.components.schemas,
    AdminError: object({ message: { type: "string" } }),
    AdminPagination: object(counts(["page", "limit", "total", "totalPages"])),
    AdminRegion: object({ id: integer, ...region }),
    AdminIngredient: object({ id: integer, ...ingredient, createdAt: { type: "string", format: "date-time" } }),
    AdminRecipe: object({ id: integer, ...recipe, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } }),
    AdminUser: user,
    AdminPeriod: object({ from: { type: "string", format: "date" }, to: { type: "string", format: "date" }, timezone: { type: "string", example: "UTC" } }),
    AdminOverview: object({ period: ref("AdminPeriod"), statistics: object(counts([
      "totalUsers", "activeUsers", "lockedUsers", "deletedUsers", "adminUsers", "totalRecipes", "totalIngredients",
      "totalRegions", "totalFavorites", "newUsers", "newRecipes", "recipeViews", "recipeRecommendations", "aiCalls",
    ])) }),
    AdminRecipeStatistics: object({ period: ref("AdminPeriod"), totals: object(recipeMetrics),
      topViewed: array(object({ id: integer, name: string(200), regionId: integer, ...recipeMetrics })),
      topRecommended: array(object({ id: integer, name: string(200), regionId: integer, ...recipeMetrics })),
      daily: array(object({ date: { type: "string", format: "date" }, ...recipeMetrics })) }),
    AdminAiStatistics: object({ period: ref("AdminPeriod"), totals: object(aiMetrics),
      byModel: array(object({ provider: { type: "string" }, model: { type: "string" }, operation: { type: "string", enum: ["CHAT", "IMAGE_ANALYSIS"] }, ...aiMetrics })),
      daily: array(object({ date: { type: "string", format: "date" }, ...aiMetrics })) }),
  };
  const param = (name, schema, description) => ({ name, in: "query", required: false, schema, description });
  const pathId = { name: "id", in: "path", required: true, schema: integer };
  const pageParams = [param("page", { ...integer, default: 1 }), param("limit", { type: "integer", minimum: 1, maximum: 100, default: 20 }), param("search", { type: "string" }, "Tìm không phân biệt hoa thường, có phân biệt dấu")];
  const dates = [param("from", { type: "string", format: "date" }, "Ngày bắt đầu, mặc định 29 ngày trước to"), param("to", { type: "string", format: "date" }, "Bao gồm cả ngày kết thúc theo UTC, mặc định hôm nay")];
  const json = (schema) => ({ "application/json": { schema } });
  const errors = Object.fromEntries([
    [400, "Dữ liệu không hợp lệ"], [401, "Chưa đăng nhập hoặc tài khoản không hoạt động"],
    [403, "Yêu cầu quyền ADMIN"], [404, "Không tìm thấy"], [409, "Trùng dữ liệu, tham chiếu đang sử dụng hoặc tài khoản đã xóa"], [500, "Lỗi máy chủ"],
  ].map(([code, description]) => [code, { description, content: json(ref("AdminError")) }]));
  const operation = (tag, summary, schema, parameters = [], requestSchema, created = false, description) => ({
    tags: [tag], summary, ...(description ? { description } : {}), security: [{ bearerAuth: [] }], parameters,
    ...(requestSchema ? { requestBody: { required: true, content: json(requestSchema) } } : {}),
    responses: { ...errors, [created ? "201" : "200"]: { description: "Thành công", content: json(schema) } },
  });
  for (const [resource, key, label, schemaName, properties, required] of [
    ["recipes", "recipe", "công thức", "AdminRecipe", recipe, ["slug", "name", "regionId", "sourceUrl", "ingredients"]],
    ["ingredients", "ingredient", "nguyên liệu", "AdminIngredient", ingredient, ["name"]],
    ["regions", "region", "vùng miền", "AdminRegion", region, ["name"]],
  ]) {
    const tag = `Admin ${resource}`;
    const filters = [...pageParams];
    if (resource === "recipes") filters.push(param("regionId", integer));
    if (resource === "ingredients") filters.push(param("categoryId", integer));
    const single = object({ [key]: ref(schemaName) });
    spec.paths[`/api/admin/${resource}`] = {
      get: operation(tag, `Danh sách ${label}`, object({ [resource]: array(ref(schemaName)), pagination: ref("AdminPagination") }), filters),
      post: operation(tag, `Thêm ${label}`, single, [], object(properties, required), true),
    };
    spec.paths[`/api/admin/${resource}/{id}`] = {
      get: operation(tag, `Chi tiết ${label}`, single, [pathId]),
      put: operation(tag, `Cập nhật ${label}`, single, [pathId], { ...object(properties), minProperties: 1 }, false,
        "Chỉ cần gửi các trường muốn sửa. ingredients nếu gửi sẽ thay toàn bộ danh sách trong transaction. null xóa imageUrl/categoryId/defaultUnit; các trường bắt buộc không nhận null."),
      delete: operation(tag, `Xóa ${label}`, object({ message: { type: "string" }, id: integer }), [pathId], undefined, false,
        resource === "recipes" ? "Xóa cả liên kết nguyên liệu, yêu thích và sự kiện thống kê của công thức."
          : "Trả 409 nếu bản ghi đang được công thức hoặc tủ lạnh tham chiếu."),
    };
  }
  spec.paths["/api/admin/users"] = {
    get: operation("Admin users", "Danh sách người dùng", object({ users: array(ref("AdminUser")), pagination: ref("AdminPagination") }),
      [...pageParams, param("role", { type: "string", enum: ["USER", "ADMIN"] }), param("status", { type: "string", enum: ["ACTIVE", "LOCKED", "DELETED"] })]),
  };
  spec.paths["/api/admin/users/{id}"] = {
    get: operation("Admin users", "Chi tiết người dùng", object({ user: ref("AdminUser") }), [pathId]),
  };
  spec.paths["/api/admin/users/{id}/status"] = {
    patch: operation("Admin users", "Khóa hoặc mở khóa người dùng", object({ user: ref("AdminUser") }), [pathId],
      object({ status: { type: "string", enum: ["ACTIVE", "LOCKED"] } }, ["status"]), false,
      "Không tự khóa tài khoản đang dùng; không khôi phục tài khoản DELETED. Khóa thu hồi mọi refresh token; access token bị từ chối ở request tiếp theo. Mở khóa cần đăng nhập lại để lấy refresh token mới."),
  };
  for (const [name, summary, schema] of [
    ["overview", "Tổng quan hệ thống", "AdminOverview"], ["recipes", "Lượt xem và gợi ý công thức", "AdminRecipeStatistics"], ["ai", "Thống kê lượt dùng AI", "AdminAiStatistics"],
  ]) {
    spec.paths[`/api/admin/statistics/${name}`] = {
      get: operation("Admin statistics", summary, ref(schema), [...dates, ...(name === "recipes" ? [param("limit", { type: "integer", minimum: 1, maximum: 100, default: 10 })] : [])], undefined, false,
        "Mặc định 30 ngày, ngày theo UTC. daily chỉ chứa ngày có sự kiện. Các total* của overview là tổng hiện tại (users bao gồm USER/ADMIN và DELETED); các lượt hoạt động/new* theo khoảng ngày. Thống kê chỉ có dữ liệu từ khi bật ghi nhận; AI chưa tích hợp provider thì trả 0 và mảng rỗng."),
    };
  }
  return spec;
};
