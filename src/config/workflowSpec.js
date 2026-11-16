module.exports = (spec) => {
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
  const id = { type: "integer", minimum: 1, maximum: 2147483647 };
  const amount = { type: "number", minimum: 0, exclusiveMinimum: true, maximum: 99999999.99, multipleOf: 0.01 };
  const string = (maxLength) => ({ type: "string", minLength: 1, maxLength });
  const object = (properties, required = []) => ({ type: "object", properties, ...(required.length ? { required } : {}) });
  const array = (items) => ({ type: "array", items });
  const timestamp = { type: "string", format: "date-time" };
  const expiry = { type: "string", format: "date", nullable: true };
  const servings = { type: "integer", minimum: 1, maximum: 100, default: 1 };
  const fields = { ingredientId: id, quantity: amount, unit: string(30) };
  const settings = { enabled: { type: "boolean", default: false }, reminderTime: { type: "string", pattern: "^([01]\\d|2[0-3]):[0-5]\\d$", example: "09:00" },
    timezone: { type: "string", example: "Asia/Ho_Chi_Minh" }, daysBefore: { type: "integer", minimum: 0, maximum: 30, default: 3 } };
  spec.components.schemas = {
    ...spec.components.schemas,
    WorkflowError: object({ message: { type: "string" } }),
    WorkflowPagination: object(Object.fromEntries(["page", "limit", "total", "totalPages"].map((key) => [key, { type: "integer", minimum: 0 }]))),
    ShoppingItem: object({ id, ...fields, name: { type: "string" }, recipeId: { ...id, nullable: true }, purchased: { type: "boolean" },
      purchasedAt: { ...timestamp, nullable: true }, movedAt: { ...timestamp, nullable: true }, fridgeItemId: { ...id, nullable: true }, createdAt: timestamp, updatedAt: timestamp }),
    CookingSession: object({ id, recipeId: { ...id, nullable: true }, recipeName: { type: "string" }, servings, note: { type: "string", nullable: true }, createdAt: timestamp,
      consumptions: array(object({ fridgeItemId: id, ingredientId: { ...id, nullable: true }, ingredientName: { type: "string" }, quantity: amount, unit: string(30) })) }),
    NotificationSettings: object({ ...settings, updatedAt: timestamp }),
    RegisteredDevice: object({ id, platform: { type: "string", enum: ["ANDROID", "IOS"] }, enabled: { type: "boolean" }, createdAt: timestamp, updatedAt: timestamp }),
  };
  const json = (schema) => ({ "application/json": { schema } });
  const query = (name, schema, description) => ({ name, in: "query", schema, ...(description ? { description } : {}) });
  const path = (name = "id") => ({ name, in: "path", required: true, schema: id });
  const paging = [query("page", { ...id, default: 1 }), query("limit", { type: "integer", minimum: 1, maximum: 100, default: 20 }), query("search", { type: "string" })];
  const operation = (tag, summary, response, { parameters = [], request, created = false, replay = false, description } = {}) => ({
    tags: [tag], summary, security: [{ bearerAuth: [] }], parameters, ...(description ? { description } : {}),
    ...(request ? { requestBody: { required: true, content: json(request) } } : {}),
    responses: {
      ...Object.fromEntries([[400, "Dữ liệu không hợp lệ"], [401, "Chưa đăng nhập hoặc tài khoản không hoạt động"], [403, "Sai quyền truy cập"], [404, "Không tìm thấy dữ liệu của bạn"], [409, "Không đủ số lượng, trạng thái xung đột hoặc dữ liệu đang dùng"], [500, "Lỗi máy chủ"]]
        .map(([status, description]) => [status, { description, content: json(ref("WorkflowError")) }])),
      [created ? "201" : "200"]: { description: "Thành công", content: json(response) },
      ...(replay ? { 200: { description: "Đã xử lý trước đó hoặc không cần thêm", content: json(response) } } : {}),
    },
  });
  spec.paths["/api/fridge/summary"] = { get: operation("Fridge", "Tổng quan các lô còn số lượng > 0", object(Object.fromEntries(
    ["totalItems", "freshItems", "expiringSoonItems", "expiredItems", "noExpiryItems"].map((key) => [key, { type: "integer", minimum: 0 }])))) };
  spec.paths["/api/ingredient-categories"] = { get: operation("Ingredients", "Danh mục nhóm nguyên liệu", object({ categories: array(object({ id, name: { type: "string" } })) })) };
  spec.paths["/api/units"] = { get: operation("Ingredients", "Đơn vị chuẩn và quy tắc quy đổi", object({ units: array(object({ code: string(30), name: string(60), conversionGroup: string(30), baseFactor: id, aliases: array({ type: "string" }) })) }),
    { description: "Chỉ đổi trong cùng conversionGroup (g↔kg, ml↔l). Cái/quả/bó không đổi chéo; đơn vị tùy chỉnh chỉ so với chính nó. Các workflow mua sắm/nấu dùng quy tắc này; % khớp công thức hiện vẫn tính theo loại nguyên liệu." }) };
  spec.paths["/api/shopping-list"] = { get: operation("Shopping list", "Danh sách mua sắm của tôi", object({ items: array(ref("ShoppingItem")), pagination: ref("WorkflowPagination") }),
    { parameters: [...paging, query("status", { type: "string", enum: ["OPEN", "PENDING", "PURCHASED", "MOVED", "ALL"], default: "OPEN" })] }) };
  spec.paths["/api/shopping-list/items"] = { post: operation("Shopping list", "Thêm nguyên liệu cần mua", object({ item: ref("ShoppingItem") }), { request: object(fields, ["ingredientId", "quantity", "unit"]), created: true }) };
  spec.paths["/api/shopping-list/items/{id}"] = {
    patch: operation("Shopping list", "Sửa lượng/đơn vị, đánh dấu đã mua", object({ item: ref("ShoppingItem") }), { parameters: [path()], request: { ...object({ quantity: amount, unit: string(30), purchased: { type: "boolean" } }), minProperties: 1 },
      description: "Mục đã chuyển vào tủ không được sửa; trả 409. purchased=false bỏ đánh dấu đã mua." }),
    delete: operation("Shopping list", "Xóa mục mua sắm", object({ message: { type: "string" } }), { parameters: [path()], description: "Xóa mục đã chuyển không xóa lô trong tủ lạnh." }),
  };
  spec.paths["/api/shopping-list/from-recipe/{recipeId}"] = { post: operation("Shopping list", "Bổ sung nguyên liệu còn thiếu cho công thức", object({ items: array(ref("ShoppingItem")), warnings: array(object({ ingredientId: id, unit: string(30), message: { type: "string" } })) }),
    { parameters: [path("recipeId")], request: object({ servings }), created: true, replay: true,
      description: "Gửi {} để dùng servings=1. Định lượng công thức là 1 phần cơ sở. Trừ tồn kho còn hạn và toàn bộ mục chưa chuyển (cả đã mua) cùng loại đơn vị quy đổi. Chỉ thêm phần thiếu, gọi lại/đồng thời không thêm trùng nhu cầu. Mua làm tròn lên 0.01 đơn vị để không thiếu; không suy đoán đơn vị không tương thích." }) };
  spec.paths["/api/shopping-list/items/{id}/move-to-fridge"] = { post: operation("Shopping list", "Chuyển đồ đã mua vào một lô tủ lạnh mới", object({ item: ref("ShoppingItem"), alreadyMoved: { type: "boolean" } }),
    { parameters: [path()], request: object({ expiresAt: expiry, quantity: amount }),
      description: "Gửi {} dùng lượng hiện tại và không hạn dùng; quantity là lượng thực tế đã mua. Tự đánh dấu purchased. Transaction và khóa chống chuyển hai lần; retry trả alreadyMoved=true, không sửa dữ liệu từ body mới. Lô đã xóa vẫn không được tạo lại qua cùng mục mua sắm." }) };
  spec.paths["/api/cooking-sessions"] = {
    get: operation("Cooking history", "Lịch sử nấu của tôi", object({ sessions: array(ref("CookingSession")), pagination: ref("WorkflowPagination") }), { parameters: paging }),
    post: operation("Cooking history", "Ghi nhận đã nấu và trừ nguyên liệu", object({ session: ref("CookingSession"), replayed: { type: "boolean" } }), {
      parameters: [{ name: "Idempotency-Key", in: "header", required: true, schema: { type: "string", format: "uuid" }, description: "UUID mới cho mỗi lần nấu; giữ nguyên khi retry" }],
      request: object({ recipeId: id, servings, note: { ...string(1000), nullable: true }, consumptions: { ...array(object({ fridgeItemId: id, quantity: amount }, ["fridgeItemId", "quantity"])), minItems: 1, maxItems: 500 } }, ["recipeId"]), created: true, replay: true,
      description: "Không gửi consumptions: tự trừ FEFO (hạn gần nhất trước, không hạn cuối), quy đổi g/kg và ml/l, không lấy lô hết hạn. Công thức là 1 phần cơ sở, servings nhân định lượng. Không trừ dư vì làm tròn 2 số thập phân; không đủ/không quy đổi được trả 409 và rollback. Gửi consumptions để xác nhận lượng thực tế theo ĐƠN VỊ CỦA LÔ, có thể khác định lượng công thức; chỉ nhận nguyên liệu thuộc món và lô của bạn còn hạn. Cùng key/body trả lịch sử cũ, khác body trả 409. Lịch sử giữ snapshot khi công thức/lô bị xóa." }),
  };
  spec.paths["/api/cooking-sessions/{id}"] = { get: operation("Cooking history", "Chi tiết lịch sử và lượng từng lô đã dùng", object({ session: ref("CookingSession") }), { parameters: [path()] }) };
  spec.paths["/api/devices"] = { post: operation("Notifications", "Đăng ký/cập nhật FCM token", object({ device: ref("RegisteredDevice") }), {
    request: object({ fcmToken: { type: "string", minLength: 20, maxLength: 2048 }, platform: { type: "string", enum: ["ANDROID", "IOS"], default: "ANDROID" } }, ["fcmToken"]), created: true,
    description: "Cùng token không tạo trùng; chuyển token sang user hiện tại khi đổi tài khoản. Android gọi khi đăng nhập và onNewToken; lưu device.id để DELETE khi logout. Không trả token trong response." }) };
  spec.paths["/api/devices/{id}"] = { delete: operation("Notifications", "Hủy nhận thông báo trên thiết bị của tôi", object({ message: { type: "string" } }), { parameters: [path()] }) };
  spec.paths["/api/settings/notifications"] = {
    get: operation("Notifications", "Xem cài đặt nhắc hạn dùng", object({ settings: ref("NotificationSettings") })),
    put: operation("Notifications", "Cập nhật cài đặt nhắc hạn dùng", object({ settings: ref("NotificationSettings") }), { request: { ...object(settings), minProperties: 1 },
      description: "Cập nhật một phần. Mặc định tắt, 09:00 Asia/Ho_Chi_Minh, trước 3 ngày. Cần worker và Firebase credentials để gửi thật. Tối đa một đợt/ngày địa phương; retry lỗi tạm thời riêng các thiết bị chưa gửi thành công." }),
  };
  spec.paths["/api/fridge"].get.parameters = [query("categoryId", id), query("expiryStatus", { type: "string", enum: ["FRESH", "EXPIRING_SOON", "EXPIRED", "NO_EXPIRY"] })];
  spec.paths["/api/fridge"].get.description = "Sắp hạn tăng dần, không hạn cuối. Khi lọc expiryStatus chỉ lấy lô quantity>0, giống summary; không lọc vẫn giữ cả lô đã dùng hết để tương thích.";
  return spec;
};
