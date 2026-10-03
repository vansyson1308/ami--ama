# Demo media

| file | what | size |
|---|---|---|
| `ami-ama-demo.mp4` | 11.6 s, 390×844, H.264: onboarding → offline badge ✓ → Thử với ảnh mẫu → rust card → Lưu vào sổ rẫy → airplane mode → Sổ rẫy still there | 0.33 MB |
| `ami-ama-demo.gif` | same, 270 px wide, 8 fps (for LinkedIn/README) | 0.97 MB |
| `01-home-offline.jpg` | home screen after an offline reload, badge "Sẵn sàng dùng offline ✓" | |
| `02-samples.jpg` | "Thử với ảnh mẫu" grid | |
| `03-result-rust.jpg` | confident result: "Có thể là bệnh rỉ sắt" + 4-step card | |
| `04-uncertain-ask-officer.jpg` | per-class safety gate: "Chưa chắc — hỏi cán bộ", "Có thể là Nhện đỏ", Hỏi cán bộ | |
| `05-field-log.jpg` | Sổ rẫy with two saved observations, "Chờ gửi" | |
| `06-evidence.jpg` | Bằng chứng: field vs studio metrics | |

Recorded with Playwright on the production build (`tests/media.spec.ts`, regenerate with `scripts/media.sh`); 390×844 viewport, screenshots at 2×.
The caption "✈️ Không có mạng — vẫn chạy" at the end of the video is a video caption added by the recording script, not app UI; the browser context is really offline at that point.

Leaf images shown are from RoCoLe (Parraga-Alava et al., 2019, CC BY 4.0) and JMuBEN (Jepkoech et al., 2021, CC BY 4.0), cropped/resized; bean leaf from iBean (Makerere AI Lab, MIT). See `public/samples/CREDITS.md`.
