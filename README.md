# Food Management Backend

## Chạy hai cổng user và admin

```bash
npm install
npm run start:user
```

Ở Terminal thứ hai, trong cùng thư mục backend:

```bash
npm run start:admin
```

| Cổng  | File khởi động    | Swagger                  | Tài khoản được phép |
| ----- | ----------------- | ------------------------ | ------------------- |
| User  | `server.js`       | `http://localhost:3000/` | USER                |
| Admin | `admin-server.js` | `http://localhost:3010/` | ADMIN               |

PostgreSQL và `.env` phải được cấu hình trước. `npm start` vẫn chạy cổng user.
Có thể thêm `USER_PORT=3000` và `ADMIN_PORT=3010` vào `.env`; cổng user còn hỗ trợ
biến `PORT` cũ khi chưa đặt `USER_PORT`. Hai port phải khác nhau.
Swagger dùng server tương đối `/`, nên hoạt động ở localhost, ngrok và Cloudflare Tunnel.

### Cách phân tách

- Hai ứng dụng Express, chạy thành hai process độc lập, dùng chung database và code xác thực.
- User: auth, hồ sơ, khẩu vị, tủ lạnh, nguyên liệu, công thức, vùng miền, yêu thích.
- Admin: auth login/refresh/logout/me/change-password và `/api/auth/admin-test`,
  cùng 21 endpoint CRUD quản trị, quản lý người dùng và thống kê tại `/api/admin`.
  Toàn bộ router này có middleware xác thực và quyền ADMIN.
- Cổng admin không có đăng ký công khai, tủ lạnh hoặc yêu thích.
  Cổng user không còn `/api/auth/admin-test`.
- Login, refresh và các API bảo vệ kiểm tra role phù hợp với cổng.
  ADMIN đăng nhập cổng user hoặc USER đăng nhập cổng admin đều bị 403.
- Middleware đọc lại trạng thái và role từ DB ở mỗi request, không dùng role cũ trong JWT
  để quyết định quyền. Tài khoản LOCKED/DELETED bị từ chối.
- Cổng admin hiện chưa có forgot/reset password riêng; luồng email hiện có ở cổng user.

### Chuẩn bị tài khoản admin

Tạo một tài khoản bằng API đăng ký của user, sau đó người quản lý database chạy SQL
đổi role cho đúng tài khoản, ví dụ trong `psql -d food_management`:

```sql
UPDATE users SET role = 'ADMIN', updated_at = NOW()
WHERE email = 'email-admin-cua-ban@example.com' AND status = 'ACTIVE';
```

Đăng nhập tài khoản này tại cổng 3010. Không có tài khoản/mật khẩu admin mặc định.

### Public hai cổng bằng Cloudflare Tunnel

Trong `~/.cloudflared/config.yml`, giữ nguyên `tunnel` và `credentials-file`,
cấu hình ingress như sau:

```yaml
ingress:
  - hostname: api.hminhtri.cloud
    service: http://localhost:3000
  - hostname: admin-api.hminhtri.cloud
    service: http://localhost:3010
  - service: http_status:404
```

Tạo thêm DNS cho admin (DNS api hiện có giữ nguyên):

```bash
cloudflared tunnel route dns food-management admin-api.hminhtri.cloud
```

Khởi động lại tunnel sau khi sửa config:

```bash
cloudflared tunnel run food-management
```

User Swagger: `https://api.hminhtri.cloud/`.
Admin Swagger: `https://admin-api.hminhtri.cloud/`.
Cần cả hai backend và tunnel đang chạy. Domain khác nhau nhưng các path auth giống nhau
(ví dụ `/api/auth/login`); mỗi domain sẽ dẫn đến đúng process và kiểm tra đúng role.

## Công thức, vùng miền và yêu thích

Sau khi đã tạo các bảng tài khoản, tủ lạnh, khẩu vị và dữ liệu nguyên liệu:

```bash
psql -d food_management -v ON_ERROR_STOP=1 -f database/recipes.sql
psql -d food_management -v ON_ERROR_STOP=1 -f database/seed_recipes.sql
```

Hai script có thể chạy lại. Seed gồm ba món demo; vùng miền chỉ để minh họa bộ lọc,
ảnh để `null`, sourceUrl là liên kết tìm hướng dẫn chứ chưa phải bài viết đã tuyển chọn.
Khi nhập dữ liệu thật cần cập nhật ảnh và URL bài hướng dẫn cụ thể.

Tất cả endpoint mới yêu cầu `Authorization: Bearer <accessToken>`:

| Method | URL                            | Chức năng                                   |
| ------ | ------------------------------ | ------------------------------------------- |
| GET    | `/api/regions`                 | Danh sách vùng miền                         |
| GET    | `/api/recipes`                 | Danh sách công thức                         |
| GET    | `/api/recipes/recommendations` | Gợi ý theo tủ lạnh và khẩu vị               |
| GET    | `/api/recipes/:id`             | Chi tiết công thức và đối chiếu nguyên liệu |
| GET    | `/api/favorites`               | Công thức yêu thích của user hiện tại       |
| POST   | `/api/favorites/:recipeId`     | Lưu yêu thích, không cần body               |
| DELETE | `/api/favorites/:recipeId`     | Bỏ yêu thích                                |

Danh sách công thức, gợi ý và yêu thích hỗ trợ:

- `search`: tìm tên, không phân biệt hoa thường, có phân biệt dấu.
- `regionIds=1,3`: chọn nhiều vùng; `regionIds=all`: tất cả vùng.
- `page=1&limit=20`: phân trang, tối đa 100 phần tử mỗi trang.
- Chỉ API gợi ý tự áp dụng `user_preferences.default_region` khi không truyền `regionIds`.

### Workflow Android

1. Đăng nhập và lưu accessToken. Trong Swagger, Authorize bằng token trần.
2. Gọi `/api/regions` để tạo các chip lọc; dùng ID trả về thay vì hardcode.
3. Thêm nguyên liệu vào tủ lạnh qua API đã có.
4. Gọi `/api/recipes/recommendations?regionIds=all`; khi chọn chip, truyền ID vùng.
5. Card hiển thị `imageUrl`, `name`, `regionName`, `matchPercentage`,
   `missingIngredientCount`, `shouldCookSoon`, `isFavorite`.
6. Bấm card gọi `/api/recipes/:id`. `ingredients[].available` phân biệt đã có/còn thiếu;
   `quantitySufficient` báo đủ số lượng cùng đơn vị, `null` nếu chưa so sánh được đơn vị.
   Mở `sourceUrl` bằng trình duyệt khi người dùng muốn xem cách nấu.
7. Bấm tim gọi POST yêu thích; bỏ tim gọi DELETE. Trang yêu thích dùng GET `/api/favorites`.

### Quy tắc so khớp

- Chỉ tính lô nguyên liệu có số lượng > 0, chưa hết hạn hoặc không có hạn dùng.
- Hết hạn hôm nay vẫn dùng được; từ hôm nay đến 3 ngày tới là sắp hết hạn.
- `% khớp = số loại nguyên liệu đang có / tổng số loại trong công thức * 100`, làm tròn.
  Đây không phải tỷ lệ đủ định lượng: xem thêm `quantitySufficient`.
- Số lượng cộng theo cùng đơn vị (không phân biệt hoa thường), chưa tự đổi kg/g hoặc bó/kg.
- Gợi ý loại món chứa tên nguyên liệu hoặc nhóm trùng với danh sách kiêng/dị ứng.
  So khớp tên có trim và không phân biệt hoa thường; không suy luận từ đồng nghĩa.
- Thứ tự: có đồ sắp hết hạn trước, sau đó % khớp giảm dần,
  số loại sắp hết hạn giảm dần, cuối cùng ID tăng dần.
- Món 0% vẫn có thể xuất hiện để hiển thị các nguyên liệu cần mua.
  Tủ lạnh rỗng trả món 0%; công thức chưa có nguyên liệu không xuất hiện trong gợi ý.
- Danh sách thường và yêu thích vẫn hiển thị món kiêng, kèm `matchesPreferences=false`
  và `ingredients[].avoided=true`. Chỉ màn hình gợi ý loại các món này.

## Đổi email và số điện thoại

Hai API nằm trên cổng user, yêu cầu Bearer access token và mật khẩu hiện tại:

```http
PUT /api/settings/email
Content-Type: application/json
Authorization: Bearer <accessToken>

{"email":"new-email@gmail.com","currentPassword":"mat-khau-hien-tai"}
```

```http
PUT /api/settings/phone
Content-Type: application/json
Authorization: Bearer <accessToken>

{"phone":"0901234567","currentPassword":"mat-khau-hien-tai"}
```

- Trả `200` kèm `user` mới; không trả password hash.
- `400`: thiếu/sai định dạng dữ liệu; `401`: sai mật khẩu hoặc chưa đăng nhập;
  `409`: email/số điện thoại đã được tài khoản khác sử dụng.
- Email trim, chuyển về chữ thường; kiểm tra trùng không phân biệt hoa/thường.
  API đăng ký và đăng nhập cũng kiểm tra email không phân biệt hoa/thường.
- Số điện thoại là chuỗi 8–15 chữ số, cho phép dấu `+` ở đầu; giữ số 0 đầu.
  Chưa tự chuẩn hóa `090...` thành `+8490...`; đăng nhập bằng đúng định dạng đã lưu.
- Chỉ đổi tài khoản trong JWT; `userId` gửi trong body không chọn được tài khoản khác.
- Không cho xóa email/số điện thoại bằng null hoặc chuỗi rỗng qua hai API này.
- Khi đổi email, các OTP quên mật khẩu cũ được vô hiệu hóa trong cùng transaction.
- Mật khẩu và phiên đăng nhập hiện tại được giữ nguyên. Liên hệ mới thay cho liên hệ cũ
  khi đăng nhập; email mới nhận các OTP quên mật khẩu tiếp theo.
- Bản hiện tại xác nhận bằng mật khẩu, chưa gửi OTP xác minh liên hệ mới.
- PUT `/api/settings/profile` chỉ chỉnh tên/avatar, không đổi email/phone.

### Cập nhật database hiện có và EC2

Sau khi code mới đã được đưa lên GitHub, trên EC2:

```bash
cd ~/food-management
git pull --ff-only
psql -h 127.0.0.1 -U food_app -d food_management -W -v ON_ERROR_STOP=1 -f database/user_contacts.sql
pm2 restart food-user --update-env
pm2 restart food-admin --update-env
```

Migration `user_contacts.sql` thêm unique index cho `LOWER(email)` và chạy lại được.
Nếu database có email trùng chỉ khác hoa/thường, migration sẽ báo lỗi và không xóa dữ liệu;
cần xử lý các tài khoản trùng trước khi triển khai tiếp. Database mới chạy `schema.sql`
đã có index này. Không chạy lại `schema.sql` trên database đang dùng.
Không có dependency mới cần cài cho thay đổi này.

## 21 endpoint quản trị Admin

### Migration và chạy

Sau các schema tài khoản, refresh token, tủ lạnh, khẩu vị và công thức, chạy:

```bash
psql -d food_management -v ON_ERROR_STOP=1 -f database/admin_statistics.sql
```

Migration chạy lại được, chỉ thêm `recipe_events`, `ai_usage_events` và các index.
Chạy migration **trước khi khởi động lại cả cổng user và admin**, vì cổng user bắt đầu
ghi sự kiện xem/gợi ý món. Trên EC2 dùng cùng tùy chọn kết nối `-h/-U/-W` như migration
`user_contacts.sql` ở trên, thay tên file thành `database/admin_statistics.sql`, rồi
restart cả hai process PM2.

Đăng nhập bằng tài khoản ADMIN ở Swagger cổng admin, Authorize bằng access token.
Mỗi request đọc lại role/status từ DB. Token USER bị 403; chưa đăng nhập hoặc tài khoản
bị khóa/xóa bị 401. Các endpoint dưới đây không được mount trên cổng user.

| Nhóm | Method | Path |
| --- | --- | --- |
| Công thức | GET, POST | `/api/admin/recipes` |
| Công thức | GET, PUT, DELETE | `/api/admin/recipes/:id` |
| Nguyên liệu chuẩn | GET, POST | `/api/admin/ingredients` |
| Nguyên liệu chuẩn | GET, PUT, DELETE | `/api/admin/ingredients/:id` |
| Vùng miền | GET, POST | `/api/admin/regions` |
| Vùng miền | GET, PUT, DELETE | `/api/admin/regions/:id` |
| Người dùng | GET | `/api/admin/users` |
| Người dùng | GET | `/api/admin/users/:id` |
| Người dùng | PATCH | `/api/admin/users/:id/status` |
| Thống kê | GET | `/api/admin/statistics/overview` |
| Thống kê | GET | `/api/admin/statistics/recipes` |
| Thống kê | GET | `/api/admin/statistics/ai` |

Tổng: 5 + 5 + 5 + 3 + 3 = **21 endpoint**, ngoài các endpoint auth/health đã có.

### Workflow nhập dữ liệu

1. GET/POST vùng miền: body `{"name":"Miền Bắc"}`.
2. GET/POST nguyên liệu: body `{"name":"Thịt bò","categoryId":2,"defaultUnit":"g"}`.
   Dùng ID nhóm có thật từ database; `categoryId` và `defaultUnit` được phép bỏ qua/null.
   Các nhóm nguyên liệu hiện có do seed tạo; CRUD nhóm không thuộc 21 endpoint này.
3. POST công thức với ID vùng/nguyên liệu vừa lấy, ví dụ bên dưới.
4. GET danh sách công thức để tìm kiếm/phân trang; PUT để sửa; DELETE để xóa.
5. Đăng nhập tài khoản USER trên cổng user để kiểm tra món mới ở danh sách/gợi ý.

```json
{
  "slug": "bo-xao-hanh-tay",
  "name": "Bò xào hành tây",
  "regionId": 1,
  "imageUrl": null,
  "sourceUrl": "https://example.com/huong-dan-bo-xao",
  "ingredients": [
    { "ingredientId": 1, "quantity": 300, "unit": "g" },
    { "ingredientId": 2, "quantity": 100, "unit": "g" }
  ]
}
```

ID và URL ở ví dụ chỉ minh họa: thay bằng dữ liệu thật. Ảnh và bài hướng dẫn là URL
HTTP/HTTPS, chưa có upload ảnh. `slug` bắt buộc, duy nhất, dùng chữ thường không dấu/số/gạch ngang.
Công thức phải có 1–200 nguyên liệu khác nhau, quantity > 0, tối đa hai chữ số thập phân.

- Danh sách: `page=1&limit=20&search=...`, tối đa 100/trang, sắp ID giảm dần.
  Công thức lọc thêm `regionId`; nguyên liệu lọc thêm `categoryId`;
  người dùng lọc `role=USER|ADMIN`, `status=ACTIVE|LOCKED|DELETED`.
- Response dùng camelCase. Danh sách có `pagination: {page,limit,total,totalPages}`;
  chi tiết/thêm/sửa trả `recipe`, `ingredient`, `region` hoặc `user`.
- PUT hỗ trợ cập nhật một phần; gửi `ingredients` sẽ thay toàn bộ danh sách trong
  transaction. Bất kỳ lỗi nào cũng rollback cả công thức lẫn liên kết nguyên liệu.
  Gửi null để xóa `imageUrl`, `categoryId`, `defaultUnit`.
- 400: dữ liệu sai; 404: ID không tồn tại; 409: trùng tên/slug hoặc tham chiếu đang dùng.
  Không xóa được nguyên liệu còn trong tủ/công thức, hoặc vùng còn công thức.
  Xóa công thức sẽ xóa liên kết nguyên liệu, yêu thích và sự kiện thống kê của món đó.

### Khóa/mở khóa người dùng

```http
PATCH /api/admin/users/123/status
Content-Type: application/json

{"status":"LOCKED"}
```

Dùng `ACTIVE` để mở khóa. Không tự khóa tài khoản đang dùng, không khôi phục tài khoản
`DELETED`. Khóa tài khoản và thu hồi mọi refresh token trong cùng transaction; access
token bị từ chối khi tài khoản còn khóa. Mở khóa không phục hồi refresh token đã thu hồi;
người dùng đăng nhập lại để có phiên refresh mới. API không trả password hash, OTP hay token.

### Thống kê và ý nghĩa số liệu

Cả ba API hỗ trợ `from=2026-11-01&to=2026-11-16`; bao gồm cả hai ngày theo **UTC**,
mặc định 30 ngày kết thúc hôm nay. API thống kê công thức thêm `limit=10` (tối đa 100).

- `overview`: `total*` là tổng bản ghi hiện tại; tổng user bao gồm ADMIN/USER và cả
  tài khoản DELETED, có các số đếm trạng thái riêng. `newUsers`, `newRecipes`, lượt xem,
  lượt gợi ý và lượt AI nằm trong khoảng ngày đã chọn.
- `recipes`: `totals`, `topViewed`, `topRecommended`, `daily`. Mỗi GET chi tiết thành công
  tính một VIEW. Mỗi món được trả trong **trang** gợi ý tính một RECOMMENDATION, không
  tính toàn bộ tập kết quả; trang rỗng/404 không ghi sự kiện. Gọi lại API được tính lại.
  GET danh sách thường/yêu thích và thao tác Admin không tính lượt xem/gợi ý.
- `ai`: tổng lượt gọi, thành công/lỗi, user riêng biệt, token input/output, theo
  provider/model/operation và ngày. Hiện chưa có module gọi AI nên chưa có dữ liệu thật:
  trả 0 và mảng rỗng. Đã có `recordAiUsage` trong `src/services/analyticsService.js` để
  module AI gọi sau mỗi lần gọi provider (kể cả lỗi); không lưu prompt/API key.
- `daily` chỉ gồm ngày có sự kiện. Thống kê bắt đầu từ khi bật ghi nhận, không tạo dữ
  liệu lịch sử giả. Xóa công thức sẽ loại các sự kiện của món đó khỏi thống kê.

## 16 endpoint cho các workflow hằng ngày

### Cập nhật database

Sau các migration hiện có, chạy:

```bash
npm install
psql -d food_management -v ON_ERROR_STOP=1 -f database/daily_workflows.sql
```

Migration chạy lại được, thêm danh mục đơn vị, mua sắm, lịch sử nấu, thiết bị, cài đặt
và sổ theo dõi gửi thông báo. Không thay đổi/xóa nguyên liệu, công thức hay tài khoản
hiện có. Khởi động lại backend sau migration. Trên EC2 dùng kết nối PostgreSQL tương
ứng (`-h/-U/-W` như hướng dẫn trước), cài dependency mới bằng `npm ci` và restart PM2.

Các API nằm trên **cổng USER**, đều cần Bearer access token:

| Nhóm | Method | Path |
| --- | --- | --- |
| Tủ lạnh | GET | `/api/fridge/summary` |
| Danh mục | GET | `/api/ingredient-categories` |
| Danh mục | GET | `/api/units` |
| Mua sắm | GET | `/api/shopping-list` |
| Mua sắm | POST | `/api/shopping-list/items` |
| Mua sắm | PATCH, DELETE | `/api/shopping-list/items/:id` |
| Mua sắm | POST | `/api/shopping-list/from-recipe/:recipeId` |
| Mua sắm | POST | `/api/shopping-list/items/:id/move-to-fridge` |
| Lịch sử nấu | GET, POST | `/api/cooking-sessions` |
| Lịch sử nấu | GET | `/api/cooking-sessions/:id` |
| Thiết bị | POST | `/api/devices` |
| Thiết bị | DELETE | `/api/devices/:id` |
| Thông báo | GET, PUT | `/api/settings/notifications` |

Tổng 3 + 6 + 3 + 4 = **16 endpoint mới**. Ngoài ra đã bổ sung bộ lọc cho GET `/api/fridge`.

### Tủ lạnh và đơn vị

- GET `/api/fridge?categoryId=2&expiryStatus=EXPIRING_SOON`: lọc nhóm và trạng thái;
  các trạng thái gồm `FRESH`, `EXPIRING_SOON`, `EXPIRED`, `NO_EXPIRY`.
- Summary đếm **số lô còn quantity > 0**, không cộng kg/g thành một tổng số lượng.
  Lọc trạng thái cũng loại lô 0; danh sách không lọc vẫn giữ lô đã dùng hết để tương thích.
- Hết hạn hôm nay vẫn còn dùng được; từ hôm nay đến 3 ngày tới thuộc nhóm sắp hết hạn.
  Các API tủ lạnh/mua sắm/nấu dùng `CURRENT_DATE` theo timezone database như phiên bản cũ.
- GET `/api/units` trả `code`, `name`, `conversionGroup`, `baseFactor`, `aliases`.
  Mua sắm và trừ nguyên liệu khi nấu đổi được g↔kg, ml↔l và các alias được khai báo.
  Cái, quả, bó là các nhóm riêng, không tự đổi chéo. Đơn vị tùy chỉnh chỉ so với chính nó
  sau trim/lowercase. Chưa đổi thể tích sang khối lượng, muỗng sang ml, bó sang g.
- PUT tủ lạnh hỗ trợ `expiresAt:null` để bỏ hạn dùng. Dữ liệu mới nên dùng YYYY-MM-DD;
  endpoint tủ lạnh cũ vẫn nhận timestamp ISO và giữ phần ngày lịch của chuỗi để tương thích.

### Danh sách mua sắm

Thêm thủ công:

```http
POST /api/shopping-list/items
Content-Type: application/json

{"ingredientId":1,"quantity":300,"unit":"g"}
```

Hoặc lấy nhu cầu còn thiếu từ một món:

```http
POST /api/shopping-list/from-recipe/1
Content-Type: application/json

{"servings":2}
```

Định lượng đang lưu trong công thức được coi là **1 phần cơ sở**; servings nhân lượng
cần dùng. Backend trừ nguyên liệu trong tủ còn hạn và các mục mua sắm chưa chuyển vào
tủ (cả đã đánh dấu mua), có xét đơn vị quy đổi. Chỉ thêm lượng thiếu còn lại; gọi lại
hoặc gọi đồng thời không cộng lặp cùng nhu cầu. Không phải kế hoạch nhiều bữa cộng dồn:
muốn mua thêm ngoài mức cần của một món thì thêm/sửa mục thủ công.

Đơn vị không tương thích trả cảnh báo `warnings`, không tự suy đoán số lượng. Lượng cần
mua làm tròn **lên** 0.01 đơn vị mua khi cần để không mua thiếu.

- GET danh sách hỗ trợ `page`, `limit` (tối đa 100), `search`,
  `status=OPEN|PENDING|PURCHASED|MOVED|ALL`; mặc định OPEN là mọi mục chưa chuyển.
- PATCH `{"purchased":true}` đánh dấu đã mua; `false` bỏ đánh dấu.
- Chuyển vào tủ bằng POST `/api/shopping-list/items/:id/move-to-fridge` với
  `{"expiresAt":"2026-12-01","quantity":350}`. Lượng là lượng thực tế đã mua,
  bỏ quantity dùng lượng trong mục, bỏ/null expiresAt là không hạn dùng.
- Chuyển tạo một lô mới và đánh dấu đã mua trong cùng transaction. Gọi lại trả
  `alreadyMoved:true`, không thêm lô lần hai, kể cả lô ban đầu đã được xóa.
- Mục đã chuyển không sửa được (409). Xóa mục mua sắm không xóa lô trong tủ.
- POST thủ công tạo mục mới mỗi lần; cơ chế chống lặp nhu cầu áp dụng cho from-recipe,
  cơ chế chống chuyển hai lần áp dụng cho move-to-fridge.

### Nấu ăn và lịch sử

```http
POST /api/cooking-sessions
Idempotency-Key: 88362cba-c6ab-4462-b9aa-77121986ac70
Content-Type: application/json

{"recipeId":1,"servings":1,"note":"Bữa trưa"}
```

Android tạo UUID mới khi người dùng xác nhận **một lần nấu**, giữ cùng key và body khi
retry do timeout/mất mạng. Lần đầu trả 201; retry cùng nội dung trả 200 kèm
`replayed:true`; cùng key nhưng nội dung khác trả 409. Không trừ tủ hai lần.

- Tự trừ FEFO: lô hạn gần nhất trước, lô không hạn cuối; không dùng lô đã hết hạn/0.
- Có quy đổi đơn vị như trên. Không trừ quá lượng cần vì làm tròn; nếu không thể trừ
  chính xác với độ chia 0.01 đơn vị của lô, hoặc không đủ nguyên liệu, trả 409 và rollback
  toàn bộ. Ví dụ cần 1g nhưng chỉ có lô tính theo kg không tự trừ 0.01kg thành 10g.
- Có thể xác nhận lượng thực tế bằng
  `{"recipeId":1,"consumptions":[{"fridgeItemId":12,"quantity":0.2}]}`.
  Quantity dùng **đơn vị hiện tại của lô**, không phải đơn vị công thức. Chế độ này ghi
  lượng thực tế do người dùng xác nhận, có thể khác định lượng món; chỉ chấp nhận lô
  của mình, còn hạn, đủ số lượng và thuộc nguyên liệu của công thức.
- Transaction khóa tồn kho; hai lần nấu không thể làm âm số lượng.
- GET danh sách hỗ trợ `page`, `limit`, `search` theo tên món snapshot. Chi tiết trả
  `consumptions` theo từng lô. Xóa công thức/lô không làm mất tên món và lượng đã nấu
  trong lịch sử; `recipeId` có thể thành null nếu công thức đã bị xóa.

### Thiết bị, cài đặt và Firebase Cloud Messaging

Android đăng ký token sau khi đăng nhập và khi `onNewToken`:

```http
POST /api/devices
Content-Type: application/json

{"fcmToken":"TOKEN_THAT_TU_FIREBASE_SDK","platform":"ANDROID"}
```

Lưu `device.id` trả về. Gọi DELETE `/api/devices/:id` **trước khi logout** để hủy đăng ký
thiết bị. Cùng FCM token không tạo trùng, chuyển về tài khoản đang đăng nhập khi đổi user.
Khi token thay mới, đăng ký token mới và hủy device ID cũ nếu còn lưu.

```http
PUT /api/settings/notifications
Content-Type: application/json

{"enabled":true,"reminderTime":"09:00","timezone":"Asia/Ho_Chi_Minh","daysBefore":3}
```

Cập nhật một phần được hỗ trợ. Mặc định **tắt**, 09:00 Asia/Ho_Chi_Minh, trước 3 ngày;
daysBefore từ 0–30. Thông báo dùng ngày địa phương của user (có thể khác timezone DB
đang dùng cho màn hình tủ lạnh).

**Để gửi thông báo thật**, cần Firebase project và credentials cho Firebase Admin SDK:

1. Bật Firebase Cloud Messaging HTTP v1 API trong project; cấu hình Firebase SDK ở Android.
2. Cấu hình Application Default Credentials cho backend. Với service-account JSON,
   để file bên ngoài repository và thêm biến môi trường vào `.env`, ví dụ:

   ```dotenv
   GOOGLE_APPLICATION_CREDENTIALS=/duong-dan-ben-ngoai-repo/firebase-service-account.json
   FIREBASE_PROJECT_ID=project-id-cua-anh
   ```

3. Android tạo notification channel `expiry_reminders`; xin quyền thông báo trên
   Android 13+, xử lý notification/data payload khi foreground. Data có `type=EXPIRY_REMINDER`,
   `localDate`, `expiringCount` để mở màn hình tủ lạnh.
4. Chạy worker riêng, ở cùng thư mục backend:

   ```bash
   npm run notifications:worker
   ```

   Chạy một lượt (có gửi thật tới các thiết bị đủ điều kiện):

   ```bash
   npm run notifications:worker -- --once
   ```

   Trên EC2 có thể quản lý process thứ ba bằng PM2:

   ```bash
   pm2 start src/workers/expiryReminderWorker.js --name food-reminders --time
   ```

Worker kiểm tra mỗi 60 giây, gửi khi đã tới giờ nhắc địa phương, tối đa một đợt mỗi
user/ngày. Chỉ user ACTIVE đã bật nhắc và có thiết bị hoạt động; chỉ lô quantity>0,
hạn từ hôm nay đến daysBefore ngày tới. Ngày đã kiểm tra mà không có lô phù hợp
được đánh dấu NO_ITEMS, không gửi lại khi thêm đồ muộn hơn cùng ngày.

Có lease để nhiều worker không cùng xử lý một đợt, lưu kết quả riêng từng thiết bị,
retry lỗi tạm thời sau 5 phút (tối đa 5 lần/ngày), không gửi lại thiết bị đã thành công.
Token bị FCM báo không hợp lệ được vô hiệu hóa. FCM không đảm bảo exactly-once:
worker chết sau khi gửi nhưng trước khi lưu kết quả có thể khiến retry gửi lặp.
Nếu worker dừng hoặc thiếu credentials, API vẫn hoạt động nhưng không tự gửi push.

## Kiểm thử

```bash
npm test
```

Integration tests dùng database trong `.env`, mở server ở port ngẫu nhiên,
tạo tài khoản/công thức riêng và xóa dữ liệu test khi kết thúc. Cần chạy schema và seed trước.
Kiểm tra xác thực, phân trang, dữ liệu sai, so khớp/hạn dùng, vùng mặc định,
kiêng/dị ứng, yêu thích không trùng và cách ly dữ liệu giữa hai người dùng.
Các bài test đổi liên hệ còn kiểm tra mật khẩu, validation, đăng nhập bằng liên hệ mới,
OTP cũ bị vô hiệu hóa và hai request đổi cùng email đồng thời. Database test hiện có
cũng cần chạy `database/user_contacts.sql` trước.
Các bài test Admin cần `database/admin_statistics.sql`, kiểm tra toàn bộ 21 endpoint,
quyền lấy từ DB thay vì claim JWT, CRUD/rollback/cập nhật đồng thời, bảo vệ tham chiếu,
thu hồi phiên khi khóa user, ghi sự kiện thật và thống kê theo ngày UTC.
Các bài test workflow cần `database/daily_workflows.sql`; kiểm tra 16 endpoint, bộ lọc
tủ lạnh, quy đổi đơn vị, shopping/cooking đồng thời, retry không trừ lặp, snapshot lịch
sử và worker theo múi giờ. Test worker dùng FCM giả lập và chỉ tài khoản fixture,
không cần credentials, không gửi push thật. Gửi tới Android thực tế cần kiểm thử riêng
sau khi cấu hình Firebase và thiết bị.
