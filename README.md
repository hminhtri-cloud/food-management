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
- Admin: auth login/refresh/logout/me/change-password và `/api/auth/admin-test`.
  Các API CRUD quản trị/thống kê sẽ triển khai tiếp tại `src/routes/admin/`, mount
  dưới router `/api/admin` đã có middleware xác thực và quyền ADMIN.
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

## Kiểm thử

```bash
npm test
```

Integration tests dùng database trong `.env`, mở server ở port ngẫu nhiên,
tạo tài khoản/công thức riêng và xóa dữ liệu test khi kết thúc. Cần chạy schema và seed trước.
Kiểm tra xác thực, phân trang, dữ liệu sai, so khớp/hạn dùng, vùng mặc định,
kiêng/dị ứng, yêu thích không trùng và cách ly dữ liệu giữa hai người dùng.
