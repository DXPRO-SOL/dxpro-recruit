const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcryptjs");
const i18next = require("i18next");
const i18nextMiddleware = require("i18next-http-middleware");
const Backend = require("i18next-fs-backend");
const path = require("path");
const nodemailer = require("nodemailer");
const multer = require("multer");
const fs = require("fs");
const upload = multer({ storage: multer.memoryStorage() }); // メモリに読み込む
const chatUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// uploadsディレクトリの確保（チャット用）
fs.mkdirSync(path.join(__dirname, "uploads/chat"), { recursive: true });

const User = require("./models/User");
const Application = require("./models/Application");
const NewgradApplication = require("./models/NewgradApplication");
const CareerApplication = require("./models/CareerApplication");
const Contact = require("./models/Contact");
const ChatMessage = require("./models/ChatMessage");
const FileStore = require("./models/FileStore");
require("dotenv").config();

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer);

app.set("trust proxy", 1);

// MongoDB 연결
mongoose.connect("mongodb+srv://dxprosol:kim650323@dxpro.ealx5.mongodb.net/dxpro-recruit");


// 세션 설정
app.use(session({
  secret: "dxpro_secret",
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: "mongodb+srv://dxprosol:kim650323@dxpro.ealx5.mongodb.net/dxpro-recruit" }),
  cookie: {
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 1000 * 60 * 60 * 24
  }
}));

// 다국어 설정
i18next
  .use(Backend)
  .use(i18nextMiddleware.LanguageDetector)
  .init({
    fallbackLng: "jp",
    preload: ["jp", "kr", "en"],
    backend: {
      loadPath: path.join(__dirname, "locales/{{lng}}/translation.json")
    }
  });

app.use(i18nextMiddleware.handle(i18next));

// JSON 파서
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 로그인 필수 미들웨어 (페이지 접근용)
function requireLoginPage(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/login.html?msg=login_required");
  }
  next();
}

// 보호할 페이지들
const protectedPages = [
  "/index.html",
  "/application-case.html",
  "/application-detail.html",
  "/application-status.html",
  "/account.html",
  "/application-case.html",
  "/career.html",
  "/new.html",
  "/recruit.html",
  "/settings.html",
  "/position-detail.html",
  "/position-detail2.html", 
  "/position-detail3.html",
  "/position-detail4.html",
  "/chat.html",
  "/admin-chat.html",
  "/",
  ""
];

// 정적 파일보다 먼저 실행
app.use((req, res, next) => {
  if (protectedPages.includes(req.path)) {
    return requireLoginPage(req, res, next);
  }
  next();
});

// 정적 파일
app.use(express.static("public"));
app.use("/uploads", express.static(path.join(__dirname, "uploads"))); // アップロードファイルを公開

// 로그인 API
app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const user = await User.findOne({ username });

  if (!user) return res.redirect("/login.html?msg=login_failed");
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) return res.redirect("/login.html?msg=login_failed");

  req.session.userId = user._id;
  req.session.userRole = user.role;

  res.redirect(`/index.html?msg=login_success&role=${user.role}`);
});

// 신규 사용자 등록 API
app.post("/register", async (req, res) => {
  const {
    username, password,
    lastName, firstName, hurilastName, hurifirstName,
    birthdate, phone, email,
    employmentType, // "newGrad" または "midCareer"
    graduationSchool, expectedGraduation, // 新卒用
    hasCurrentJob, expectedResignation, desiredJoinDate // 中途用
  } = req.body;

  // ユーザー名重複チェック
  const existingUser = await User.findOne({ username });
  if (existingUser) {
    return res.status(400).send("このユーザー名は既に存在します");
  }

  // パスワードハッシュ化
  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = new User({
    username,
    password: hashedPassword,
    lastName,
    firstName,
    hurilastName,
    hurifirstName,
    birthdate,
    phone,
    email,
    role: "user",
    employmentType,
    // 新卒用
    graduationSchool: employmentType === "newGrad" ? graduationSchool : undefined,
    expectedGraduation: employmentType === "newGrad" ? expectedGraduation : undefined,
    // 中途用
    hasCurrentJob: employmentType === "midCareer" ? hasCurrentJob === "on" : undefined,
    expectedResignation: employmentType === "midCareer" && hasCurrentJob === "on" ? expectedResignation : undefined,
    desiredJoinDate: employmentType === "midCareer" && hasCurrentJob === "on" ? desiredJoinDate : undefined
  });

  await newUser.save();
  console.log("新規ユーザー登録:", username);
  res.redirect("/login.html?msg=register_success");
});

// 로그아웃
app.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/login.html?msg=logout_success");
  });
});

// 관리자 이메일
const ADMIN_EMAIL = "kim_taehoon@dxpro-sol.com";

const transporter = nodemailer.createTransport({
  host: "smtp-relay.brevo.com",
  port: 587,
  secure: false,          // STARTTLS を使う場合は false
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  },
  tls: {
    rejectUnauthorized: false // 自己署名証明書でも接続できる
  },
  connectionTimeout: 10000  // 10秒
});


transporter.verify((err, success) => {
  if (err) console.error("認証エラー:", err);
  else console.log("接続成功!");
});

const positionMap = {
  frontend: "フロントエンド",
  backend: "バックエンド",
  designer: "UIデザイナー",
  pm: "プロジェクトマネージャー",
  consultant: "コンサルタント",
  qaengineer: "QAエンジニア"
};

// 이메일 전송 공통 함수
async function sendApplicationEmailNew(fields, files) {
  const attachments = [];
  for (const key in files) {
    if (files[key]) {
      const fileList = Array.isArray(files[key]) ? files[key] : [files[key]];
      fileList.forEach(f => {
        const fixedName = Buffer.from(f.originalname, 'latin1').toString('utf8');
        attachments.push({ filename: fixedName, content: f.buffer });
      });
    }
  }

  let textContent = "";

  // 基本情報
  if (fields.lastName || fields.firstName)
    textContent += `名前: ${fields.lastName || ""} ${fields.firstName || ""}\n`;
  if (fields.hurilastName || fields.hurifirstName)
    textContent += `フリガナ: ${fields.hurilastName || ""} ${fields.hurifirstName || ""}\n`;
  if (fields.birthdate) textContent += `生年月日: ${fields.birthdate}\n`;
  if (fields.gender) textContent += `性別: ${fields.gender}\n`;
  if (fields.phone) textContent += `電話: ${fields.phone}\n`;
  if (fields.email) textContent += `メール: ${fields.email}\n`;

  // 住所
  if (!fields.noAddress) {
    if (fields.postalCode) textContent += `郵便番号: ${fields.postalCode}\n`;
    if (fields.prefecture || fields.city || fields.addressDetail)
      textContent += `住所: ${fields.prefecture || ""}${fields.city || ""}${fields.addressDetail || ""}\n`;
  } else {
    textContent += `住所: （記入なし）\n`;
  }

  // 学歴
  if (fields.education) textContent += `学歴: ${fields.education}\n`;
  if (fields.major) textContent += `専攻: ${fields.major}\n`;
  if (fields.graduation) textContent += `卒業予定: ${fields.graduation}\n`;

  // 希望
  const positionMap = { frontend: "フロントエンド", backend: "バックエンド", designer: "デザイナー" };
  if (fields.position) textContent += `希望ポジション: ${positionMap[fields.position] || fields.position}\n`;
  if (fields.locationPreference) textContent += `勤務希望: ${fields.locationPreference}\n`;

  // 添付資料
  if (fields.portfolio) textContent += `GitHub/ポートフォリオ: ${fields.portfolio}\n`;
  if (fields.resume) textContent += `履歴書: 添付あり\n`;
  if (fields.portfolioFiles && fields.portfolioFiles.length > 0) textContent += `作品ファイル: 添付あり (${fields.portfolioFiles.length}件)\n`;

  // 自己PR
  if (fields.pr) {
    const prLines = fields.pr.split(/\r?\n/);
    textContent += "自己PR:\n";
    prLines.forEach(line => {
      textContent += `  ${line}\n`;
    });
  }
  if (fields.motivation) {
    const motivationLines = fields.motivation.split(/\r?\n/);
    textContent += "志望動機:\n";
    motivationLines.forEach(line => {
      textContent += `  ${line}\n`;
    });
  }

  // 同意
  if (fields.consent) textContent += "✔ 応募者本人による事実確認済み\n";

  await transporter.sendMail({
    from: '"DXPRO採用" <kim_taehoon@dxpro-sol.com>',
    to: ADMIN_EMAIL,
    cc: fields.email,
    subject: `【新卒応募】${fields.lastName || ""}${fields.firstName || ""} さんの応募情報`,
    text: textContent,
    attachments
  });
  // ファイルはuploads/に保持（詳細画面でダウンロード可能にするため削除しない）
}

async function sendApplicationEmailCareer(fields, files) {
  const attachments = [];
  for (const key in files) {
    if (files[key]) {
      const fileList = Array.isArray(files[key]) ? files[key] : [files[key]];
      fileList.forEach(f => {
        const fixedName = Buffer.from(f.originalname, 'latin1').toString('utf8');
        attachments.push({ filename: fixedName, content: f.buffer });
      });
    }
  }

  let textContent = "";

  // 基本情報
  if (fields.lastName || fields.firstName)
    textContent += `名前: ${fields.lastName || ""} ${fields.firstName || ""}\n`;
  if (fields.hurilastName || fields.hurifirstName)
    textContent += `フリガナ: ${fields.hurilastName || ""} ${fields.hurifirstName || ""}\n`;
  if (fields.birthdate) textContent += `生年月日: ${fields.birthdate}\n`;
  if (fields.gender) textContent += `性別: ${fields.gender}\n`;
  if (fields.phone) textContent += `電話: ${fields.phone}\n`;
  if (fields.email) textContent += `メール: ${fields.email}\n`;

  // 住所
  if (!fields.noAddress) {
    if (fields.postalCode) textContent += `郵便番号: ${fields.postalCode}\n`;
    if (fields.prefecture || fields.city || fields.addressDetail)
      textContent += `住所: ${fields.prefecture || ""}${fields.city || ""}${fields.addressDetail || ""}\n`;
  } else {
    textContent += `住所: （記入なし）\n`;
  }

  // 学歴
  if (fields.education) textContent += `学歴: ${fields.education}\n`;
  if (fields.major) textContent += `専攻: ${fields.major}\n`;
  if (fields.graduation) textContent += `卒業予定: ${fields.graduation}\n`;

  // 現職情報
  if (fields.currentCompany) textContent += `現職: ${fields.currentCompany}\n`;
  if (fields.currentPosition) textContent += `役職: ${fields.currentPosition}\n`;
  if (fields.currentJobDescription) textContent += `仕事内容: ${fields.currentJobDescription}\n`;
  if (fields.experienceYears) textContent += `経験年数: ${fields.experienceYears}年\n`;

  // 希望条件
  const positionMap = {
    frontend: "フロントエンド",
    backend: "バックエンド",
    designer: "UIデザイナー",
    pm: "プロジェクトマネージャー",
    consultant: "コンサルタント",
    qaengineer: "QAエンジニア"
  };
  if (fields.position) textContent += `希望ポジション: ${positionMap[fields.position] || fields.position}\n`;
  if (fields.locationPreference) textContent += `勤務希望: ${fields.locationPreference}\n`;
  if (fields.gold) textContent += `希望年収: ${fields.gold}\n`;

  // 添付資料
  if (fields.resume) textContent += `履歴書: 添付あり\n`;
  if (fields.career) textContent += `職務経歴書: 添付あり\n`;
  if (fields.portfolio) textContent += `GitHub/ポートフォリオ: ${fields.portfolio}\n`;
  if (fields.portfolioFiles && fields.portfolioFiles.length > 0)
    textContent += `作品ファイル: 添付あり (${fields.portfolioFiles.length}件)\n`;

  // 自己PR
  if (fields.pr) {
    textContent += "自己PR:\n";
    fields.pr.split(/\r?\n/).forEach(line => (textContent += `  ${line}\n`));
  }

  // 転職理由
  if (fields.changeReason) {
    textContent += "転職理由:\n";
    fields.changeReason.split(/\r?\n/).forEach(line => (textContent += `  ${line}\n`));
  }

  // 希望入社時期
  if (fields.desiredJoinDate) textContent += `希望入社時期: ${fields.desiredJoinDate}\n`;

  // 同意
  if (fields.consent) textContent += "✔ 応募者本人による事実確認済み\n";

  await transporter.sendMail({
    from: '"DXPRO採用" <kim_taehoon@dxpro-sol.com>',
    to: ADMIN_EMAIL,
    subject: `【キャリア応募】${fields.lastName || ""}${fields.firstName || ""} さんの応募情報`,
    text: textContent,
    attachments
  });
  // ファイルはuploads/に保持（詳細画面でダウンロード可能にするため削除しない）
}

// 신입 지원
app.post("/apply/newgrad", upload.fields([
  { name: "resume", maxCount: 1 },
  { name: "portfolioFiles", maxCount: 5 }
]), async (req, res) => {
  try {
    const files = req.files || {};

    // ファイルをMongoDBに保存
    let resumeFileId = null, resumeFileName = null;
    if (files.resume?.[0]) {
      const f = files.resume[0];
      const fixedName = Buffer.from(f.originalname, 'latin1').toString('utf8');
      const stored = await new FileStore({ originalName: fixedName, mimeType: f.mimetype, data: f.buffer, size: f.size }).save();
      resumeFileId = stored._id;
      resumeFileName = fixedName;
    }
    const portfolioFileIds = [];
    for (const f of (files.portfolioFiles || [])) {
      const fixedName = Buffer.from(f.originalname, 'latin1').toString('utf8');
      const stored = await new FileStore({ originalName: fixedName, mimeType: f.mimetype, data: f.buffer, size: f.size }).save();
      portfolioFileIds.push({ fileId: stored._id, fileName: fixedName });
    }

    const appData = {
      userId: req.session.userId || null,
      ...req.body,
      consent: req.body.consent === "on",
      noAddress: req.body.noAddress === "on" || req.body.noAddress === "true" || req.body.noAddress === true,
      resumeFileId, resumeFileName, portfolioFileIds
    };

    const application = new NewgradApplication(appData);
    await application.save();
    await sendApplicationEmailNew(req.body, files);
    res.json({ status: "success", message: "応募完了しました" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: "送信失敗" });
  }
});

// 경력 지원
app.post("/apply/career", upload.fields([
  { name: "resume", maxCount: 1 },
  { name: "career", maxCount: 1 },
  { name: "portfolioFiles", maxCount: 5 }
]), async (req, res) => {
  try {
    const files = req.files || {};

    let resumeFileId = null, resumeFileName = null;
    if (files.resume?.[0]) {
      const f = files.resume[0];
      const fixedName = Buffer.from(f.originalname, 'latin1').toString('utf8');
      const stored = await new FileStore({ originalName: fixedName, mimeType: f.mimetype, data: f.buffer, size: f.size }).save();
      resumeFileId = stored._id; resumeFileName = fixedName;
    }
    let careerFileId = null, careerFileName = null;
    if (files.career?.[0]) {
      const f = files.career[0];
      const fixedName = Buffer.from(f.originalname, 'latin1').toString('utf8');
      const stored = await new FileStore({ originalName: fixedName, mimeType: f.mimetype, data: f.buffer, size: f.size }).save();
      careerFileId = stored._id; careerFileName = fixedName;
    }
    const portfolioFileIds = [];
    for (const f of (files.portfolioFiles || [])) {
      const fixedName = Buffer.from(f.originalname, 'latin1').toString('utf8');
      const stored = await new FileStore({ originalName: fixedName, mimeType: f.mimetype, data: f.buffer, size: f.size }).save();
      portfolioFileIds.push({ fileId: stored._id, fileName: fixedName });
    }

    const appData = {
      userId: req.session.userId || null,
      ...req.body,
      consent: req.body.consent === "on",
      noAddress: req.body.noAddress === "on" || req.body.noAddress === "true" || req.body.noAddress === true,
      resumeFileId, resumeFileName, careerFileId, careerFileName, portfolioFileIds
    };

    const application = new CareerApplication(appData);
    await application.save();
    await sendApplicationEmailCareer(req.body, files);
    res.json({ status: "success", message: "応募完了しました" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ status: "error", message: "送信失敗" });
  }
});

// ログイン必須ミドルウェア
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "ログインが必要です" });
  next();
}

const ResetToken = require("./models/ResetToken");
const crypto = require('crypto');

// パスワードリセットリクエスト（デバッグ用ログ追加）
app.post('/api/forgot-password', async (req, res) => {
  try {
    console.log('パスワードリセットリクエスト受信:', req.body);
    
    const { email } = req.body;
    
    if (!email) {
      console.log('メールアドレスが提供されていません');
      return res.status(400).json({ 
        status: 'error', 
        message: 'メールアドレスが必要です' 
      });
    }
    
    // ユーザーの存在確認
    const user = await User.findOne({ email });
    console.log('ユーザー検索結果:', user ? '見つかりました' : '見つかりませんでした');
    
    if (!user) {
      // セキュリティ上の理由で、ユーザーが存在しない場合でも成功メッセージを返す
      return res.json({ 
        status: 'success', 
        message: 'パスワードリセットリンクを送信しました' 
      });
    }

    // 既存のトークンを削除
    await ResetToken.deleteMany({ userId: user._id });

    // リセットトークン生成
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // トークンをDBに保存
    await new ResetToken({
      userId: user._id,
      token: hashedToken,
      createdAt: Date.now(),
    }).save();

    // リセットリンクの生成
    const resetLink = `${req.protocol}://${req.get('host')}/reset-password.html?token=${resetToken}&id=${user._id}`;
    console.log('生成されたリセットリンク:', resetLink);

    // メール送信（テストモードの場合はスキップ）
    if (process.env.NODE_ENV !== 'test') {
    await transporter.sendMail({
      from: '"DXPRO SOLUTIONSサポート" <info@dxpro-sol.com>',
      to: email,
      subject: 'パスワードリセットのご案内',
      html: `
        <p>パスワードリセットのリクエストを受け付けました。</p>
        <p>以下のリンクをクリックして新しいパスワードを設定してください：</p>
        <a href="${resetLink}">パスワードをリセットする</a>
        <p>※リンクの有効期限は1時間です。</p>
      `
    });
      console.log('パスワードリセットメールを送信しました');
    } else {
      console.log('テストモード: メール送信をスキップしました');
    }

    res.json({ 
      status: 'success', 
      message: 'パスワードリセットリンクを送信しました' 
    });
  } catch (error) {
    console.error('パスワードリセットエラー:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'サーバーエラーが発生しました' 
    });
  }
});

// パスワードリセットの実行
app.post('/api/reset-password', async (req, res) => {
  try {
    const { userId, token, password } = req.body;

    // トークンの検証
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const resetToken = await ResetToken.findOne({
      userId,
      token: hashedToken,
      createdAt: { $gt: new Date(Date.now() - 3600 * 1000) } // 1時間以内のトークンのみ有効
    });

    if (!resetToken) {
      return res.status(400).json({ 
        status: 'error', 
        message: '無効または期限切れのトークンです' 
      });
    }

    // パスワードの更新
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.findByIdAndUpdate(userId, { password: hashedPassword });

    // 使用済みトークンの削除
    await ResetToken.findByIdAndDelete(resetToken._id);

    res.json({ 
      status: 'success', 
      message: 'パスワードが正常に更新されました' 
    });
  } catch (error) {
    console.error('パスワードリセットエラー:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'サーバーエラーが発生しました' 
    });
  }
});

// トークンの有効性チェックAPIの修正
app.get('/api/verify-reset-token', async (req, res) => {
  try {
    console.log('トークン検証リクエスト受信 query params:', req.query);
    
    // 両方のパラメータ名に対応（id と userId）
    const userId = req.query.userId || req.query.id;
    const token = req.query.token;

    console.log('解析されたパラメータ - userId:', userId, 'token:', token);

    if (!userId || !token) {
      console.log('userIdまたはtokenが不足しています');
      return res.status(400).json({ 
        status: 'error', 
        message: '無効なリクエストです' 
      });
    }

    // userIdが有効なObjectIdか確認
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      console.log('無効なuserId形式:', userId);
      return res.status(400).json({ 
        status: 'error', 
        message: '無効なユーザーIDです' 
      });
    }

    // トークンのデコード（URLエンコードされている場合）
    const decodedToken = decodeURIComponent(token);
    const hashedToken = crypto.createHash('sha256').update(decodedToken).digest('hex');
    console.log('元のトークン:', token);
    console.log('デコードされたトークン:', decodedToken);
    console.log('ハッシュ化されたトークン:', hashedToken);
    
    // トークン検索
    const resetToken = await ResetToken.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      token: hashedToken,
      createdAt: { $gt: new Date(Date.now() - 3600 * 1000) } // 1時間以内のトークンのみ有効
    });

    console.log('データベース検索結果:', resetToken);
    
    if (!resetToken) {
      // より詳細なエラー情報を提供
      const expiredToken = await ResetToken.findOne({
        userId: new mongoose.Types.ObjectId(userId),
        token: hashedToken
      });
      
      if (expiredToken) {
        console.log('期限切れトークンが見つかりました');
        return res.status(400).json({ 
          status: 'error', 
          message: 'トークンの有効期限が切れています。新しいリセットリンクを請求してください。' 
        });
      } else {
        console.log('トークンが存在しません');
        // データベースの状態を確認
        const allTokens = await ResetToken.find({ userId: new mongoose.Types.ObjectId(userId) });
        console.log('ユーザーのすべてのトークン:', allTokens);
        
        return res.status(400).json({ 
          status: 'error', 
          message: '無効なトークンです。新しいリセットリンクを請求してください。' 
        });
      }
    }

    console.log('トークン検証成功');
    res.json({ 
      status: 'success', 
      message: '有効なトークンです' 
    });
  } catch (error) {
    console.error('トークン検証エラー:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'サーバーエラーが発生しました' 
    });
  }
});

// データベースデバッグ用の関数
app.get('/api/debug-tokens/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        status: 'error', 
        message: '無効なユーザーIDです' 
      });
    }
    
    const tokens = await ResetToken.find({ 
      userId: new mongoose.Types.ObjectId(userId) 
    });
    
    console.log('ユーザーのトークン:', tokens);
    
    res.json({ 
      status: 'success', 
      tokens: tokens,
      count: tokens.length
    });
  } catch (error) {
    console.error('デバッグエラー:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'サーバーエラーが発生しました' 
    });
  }
});

// すべてのトークンを表示（デバッグ用）
app.get('/api/debug-all-tokens', async (req, res) => {
  try {
    const tokens = await ResetToken.find().populate('userId', 'email');
    console.log('すべてのトークン:', tokens);
    
    res.json({ 
      status: 'success', 
      tokens: tokens,
      count: tokens.length
    });
  } catch (error) {
    console.error('デバッグエラー:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'サーバーエラーが発生しました' 
    });
  }
});

// ユーザーのメールアドレスを取得するAPI（server.jsに追加）
app.get('/api/user-email/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ 
        status: 'error', 
        message: '無効なユーザーIDです' 
      });
    }
    
    const user = await User.findById(userId).select('email');
    
    if (!user) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'ユーザーが見つかりません' 
      });
    }
    
    res.json({ 
      status: 'success', 
      email: user.email 
    });
  } catch (error) {
    console.error('ユーザー情報取得エラー:', error);
    res.status(500).json({ 
      status: 'error', 
      message: 'サーバーエラーが発生しました' 
    });
  }
});

// アカウント設定更新
app.post("/api/user/account", requireLogin, async (req, res) => {
  try {
    const { username, email, phone, password } = req.body;

    const updateData = { username, email, phone };
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await User.findByIdAndUpdate(req.session.userId, updateData);
    res.json({ status: "success", message: "アカウント情報を更新しました" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// 応募設定更新
app.post("/api/user/apply", requireLogin, async (req, res) => {
  try {
    const { employmentType, graduationSchool, expectedGraduation, hasCurrentJob, expectedResignation, desiredJoinDate } = req.body;

    const updateData = {
      employmentType,
      graduationSchool: employmentType === "newGrad" ? graduationSchool : undefined,
      expectedGraduation: employmentType === "newGrad" ? expectedGraduation : undefined,
      hasCurrentJob: employmentType === "midCareer" ? hasCurrentJob === "on" : undefined,
      expectedResignation: employmentType === "midCareer" && hasCurrentJob === "on" ? expectedResignation : undefined,
      desiredJoinDate: employmentType === "midCareer" && hasCurrentJob === "on" ? desiredJoinDate : undefined
    };

    await User.findByIdAndUpdate(req.session.userId, updateData);
    res.json({ status: "success", message: "応募設定を更新しました" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// ユーザー情報取得
app.get("/api/user/me", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).lean();
    if (!user) return res.status(404).json({ error: "ユーザーが存在しません" });
    res.json({ status: "success", user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// ユーザー情報更新
app.post("/api/user/me", requireLogin, async (req, res) => {
  try {
    const {
      username, email, phone, password,
      lastName, firstName, hurilastName, hurifirstName, birthdate,
      employmentType, graduationSchool, expectedGraduation,
      hasCurrentJob, expectedResignation, desiredJoinDate
    } = req.body;

    const updateData = {
      username, email, phone,
      lastName, firstName, hurilastName, hurifirstName, birthdate,
      employmentType,
      graduationSchool: employmentType === "newGrad" ? graduationSchool : undefined,
      expectedGraduation: employmentType === "newGrad" ? expectedGraduation : undefined,
      hasCurrentJob: employmentType === "midCareer" ? hasCurrentJob === "on" : undefined,
      expectedResignation: employmentType === "midCareer" && hasCurrentJob === "on" ? expectedResignation : undefined,
      desiredJoinDate: employmentType === "midCareer" && hasCurrentJob === "on" ? desiredJoinDate : undefined
    };

    // パスワード変更
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    await User.findByIdAndUpdate(req.session.userId, updateData);
    res.json({ status: "success", message: "ユーザー情報を更新しました" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "サーバーエラー" });
  }
});

// 제출 내역 조회
app.get("/api/applications", requireLogin, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    const isAdmin = user && user.role === "admin";

    // 管理者は全件、一般ユーザーは自分の応募のみ
    const query = isAdmin ? {} : { userId: req.session.userId };

    const newgradApps = (await NewgradApplication.find(query).lean())
      .map(app => ({ ...app, type: "新卒", typeKey: "newgrad" }));
    const careerApps = (await CareerApplication.find(query).lean())
      .map(app => ({ ...app, type: "中途", typeKey: "career" }));

    const allApps = [...newgradApps, ...careerApps].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ status: "success", applications: allApps });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "サーバーエラー" });
  }
});

// 応募詳細取得
app.get("/api/application/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // CareerApplication を検索
    let application = await CareerApplication.findById(id).lean();
    if (application) {
      application.type = "中途"; // type を追加
    }

    // 見つからなければ NewgradApplication を検索
    if (!application) {
      application = await NewgradApplication.findById(id).lean();
      if (application) {
        application.type = "新卒"; // type を追加
      }
    }

    if (!application) {
      return res.json({ status: "error", message: "応募情報が見つかりません" });
    }

    res.json({ status: "success", application });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "サーバーエラー" });
  }
});

// 応募詳細画面 (新卒・キャリア両方対応)
app.get("/applications/:id", requireLogin, async (req, res) => {
  const { id } = req.params;

  try {
    // 新卒応募
    let application = await NewgradApplication.findById(id).lean();
    if (!application) {
      // キャリア応募
      application = await CareerApplication.findById(id).lean();
    }

    if (!application) {
      return res.status(404).send("応募が見つかりません");
    }

    // ここで EJS や Pug 等でレンダリング
    res.send(`
      <html>
        <head>
          <title>応募詳細</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="p-6">
          <h1 class="text-2xl font-bold mb-4">応募詳細</h1>
          <p>名前: ${application.lastName || ""} ${application.firstName || ""}</p>
          <p>メール: ${application.email || ""}</p>
          <p>応募タイプ: ${application.type || "不明"}</p>
          <p>希望ポジション: ${positionMap[application.position] || application.position || ""}</p>
          <p>ステータス: ${application.status || "送信済み"}</p>
          <a href="/applications.html" class="mt-4 inline-block text-blue-600 hover:underline">戻る</a>
        </body>
      </html>
    `);

  } catch (err) {
    console.error(err);
    res.status(500).send("サーバーエラー");
  }
});

app.use(express.urlencoded({ extended: true })); // フォーム形式も解析

// お問い合わせ送信
app.post("/contact", async (req, res) => {
  try {
    const { name, email, phone, message } = req.body;

    // DBに保存
    const contact = new Contact({ name, email, phone, message });
    await contact.save();

    // 管理者にメール通知
    await transporter.sendMail({
      from: '"DXPROお問い合わせ" <kim_taehoon@dxpro-sol.com>',
      to: ADMIN_EMAIL,
      subject: `【お問い合わせ】${name} さんより`,
      text: `名前: ${name}\nメール: ${email}\n電話: ${phone || "なし"}\n\n本文:\n${message}`
    });

    res.json({ status: "success", message: "お問い合わせを送信しました" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "送信失敗" });
  }
});

// ================== チャット API ==================

// 応募IDのチャット履歴取得
app.get("/api/chat/:applicationId", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "ログインが必要です" });
  try {
    const messages = await ChatMessage.find({ applicationId: req.params.applicationId })
      .sort({ createdAt: 1 });
    await ChatMessage.updateMany(
      { applicationId: req.params.applicationId, senderId: { $ne: req.session.userId }, read: false },
      { read: true }
    );
    res.json(messages);
  } catch (e) {
    res.status(500).json({ error: "エラーが発生しました" });
  }
});

// 管理者: チャット一覧
app.get("/api/chat-rooms", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "ログインが必要です" });
  const user = await User.findById(req.session.userId);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "権限がありません" });
  try {
    // チャット済み応募のルーム一覧
    const rooms = await ChatMessage.aggregate([
      { $sort: { createdAt: -1 } },
      { $group: {
        _id: "$applicationId",
        applicationType: { $first: "$applicationType" },
        lastMessage: { $first: "$message" },
        lastSenderName: { $first: "$senderName" },
        lastTime: { $first: "$createdAt" },
        unread: { $sum: { $cond: [{ $and: [{ $eq: ["$senderRole","user"] }, { $eq: ["$read", false] }] }, 1, 0] } }
      }},
      { $sort: { lastTime: -1 } }
    ]);
    res.json(rooms);
  } catch (e) {
    res.status(500).json({ error: "エラーが発生しました" });
  }
});

// 管理者: 全応募一覧（チャット開始用）
app.get("/api/admin/all-applications", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "ログインが必要です" });
  const user = await User.findById(req.session.userId);
  if (!user || user.role !== "admin") return res.status(403).json({ error: "権限がありません" });
  try {
    const newgradApps = (await NewgradApplication.find({}).select("_id position lastName firstName email createdAt userId").lean())
      .map(a => ({ ...a, type: "newgrad" }));
    const careerApps = (await CareerApplication.find({}).select("_id position lastName firstName email createdAt userId").lean())
      .map(a => ({ ...a, type: "career" }));
    const all = [...newgradApps, ...careerApps].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json(all);
  } catch (e) {
    res.status(500).json({ error: "エラーが発生しました" });
  }
});

// 応募者: 自分の応募チャット一覧
app.get("/api/my-chat-rooms", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "ログインが必要です" });
  try {
    const newgradApps = await NewgradApplication.find({ userId: req.session.userId }).select("_id position createdAt");
    const careerApps = await CareerApplication.find({ userId: req.session.userId }).select("_id position createdAt");
    const allApps = [
      ...newgradApps.map(a => ({ ...a.toObject(), type: "newgrad" })),
      ...careerApps.map(a => ({ ...a.toObject(), type: "career" }))
    ];
    const result = await Promise.all(allApps.map(async (app) => {
      const last = await ChatMessage.findOne({ applicationId: app._id.toString() }).sort({ createdAt: -1 });
      const unread = await ChatMessage.countDocuments({ applicationId: app._id.toString(), senderRole: "admin", read: false });
      return { ...app, lastMessage: last?.message || null, lastTime: last?.createdAt || null, unread };
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: "エラーが発生しました" });
  }
});

// セッション情報をクライアントに返すAPI
app.get("/api/me", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "未ログイン" });
  const user = await User.findById(req.session.userId).select("_id username role lastName firstName");
  res.json(user);
});

// ================== チャット追加API ==================

// ファイル配信 (MongoDBから直接返す)
app.get("/api/file/:id", async (req, res) => {
  try {
    const file = await FileStore.findById(req.params.id);
    if (!file) return res.status(404).send("ファイルが見つかりません");
    res.set("Content-Type", file.mimeType);
    res.set("Content-Disposition", `inline; filename="${encodeURIComponent(file.originalName)}"`);
    res.send(file.data);
  } catch (e) {
    res.status(500).send("エラーが発生しました");
  }
});

// チャット添付ファイルアップロード（MongoDBに保存）
app.post("/api/chat/upload", chatUpload.single("file"), async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "ログインが必要です" });
  if (!req.file) return res.status(400).json({ error: "ファイルがありません" });
  try {
    const isImage = req.file.mimetype.startsWith("image/");
    const fixedName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const stored = await new FileStore({
      originalName: fixedName,
      mimeType: req.file.mimetype,
      data: req.file.buffer,
      size: req.file.size
    }).save();
    res.json({
      fileUrl: `/api/file/${stored._id}`,
      fileName: fixedName,
      fileType: isImage ? "image" : "file"
    });
  } catch (e) {
    res.status(500).json({ error: "アップロードエラー" });
  }
});

// いいねトグル
app.post("/api/chat/message/:id/like", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "ログインが必要です" });
  try {
    const user = await User.findById(req.session.userId).select("lastName firstName username");
    const userName = user ? `${user.lastName || ""}${user.firstName || user.username}` : "匿名";
    const msg = await ChatMessage.findById(req.params.id);
    if (!msg) return res.status(404).json({ error: "メッセージが見つかりません" });
    const idx = msg.likes.findIndex(l => l.userId === req.session.userId.toString());
    if (idx >= 0) {
      msg.likes.splice(idx, 1);
    } else {
      msg.likes.push({ userId: req.session.userId.toString(), userName });
    }
    await msg.save();
    io.to(msg.applicationId).emit("messageLiked", { messageId: msg._id.toString(), likes: msg.likes });
    res.json({ likes: msg.likes });
  } catch (e) {
    res.status(500).json({ error: "エラーが発生しました" });
  }
});

// メッセージ編集
app.put("/api/chat/message/:id", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "ログインが必要です" });
  try {
    const msg = await ChatMessage.findById(req.params.id);
    if (!msg) return res.status(404).json({ error: "メッセージが見つかりません" });
    if (msg.senderId.toString() !== req.session.userId.toString()) return res.status(403).json({ error: "権限がありません" });
    if (msg.deleted) return res.status(400).json({ error: "削除済みメッセージは編集できません" });
    msg.message = req.body.message || msg.message;
    msg.edited = true;
    await msg.save();
    io.to(msg.applicationId).emit("messageEdited", { messageId: msg._id.toString(), message: msg.message });
    res.json({ status: "success" });
  } catch (e) {
    res.status(500).json({ error: "エラーが発生しました" });
  }
});

// メッセージ削除（ソフトデリート）
app.delete("/api/chat/message/:id", async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: "ログインが必要です" });
  try {
    const user = await User.findById(req.session.userId);
    const msg = await ChatMessage.findById(req.params.id);
    if (!msg) return res.status(404).json({ error: "メッセージが見つかりません" });
    // 送信者本人またはadminのみ削除可
    const isOwner = msg.senderId.toString() === req.session.userId.toString();
    const isAdmin = user && user.role === "admin";
    if (!isOwner && !isAdmin) return res.status(403).json({ error: "権限がありません" });
    msg.deleted = true;
    await msg.save();
    io.to(msg.applicationId).emit("messageDeleted", { messageId: msg._id.toString() });
    res.json({ status: "success" });
  } catch (e) {
    res.status(500).json({ error: "エラーが発生しました" });
  }
});

// Socket.io チャット
io.on("connection", (socket) => {
  socket.on("joinRoom", (applicationId) => {
    socket.join(applicationId);
  });
  socket.on("sendMessage", async (data) => {
    try {
      // applicationType を正規化（日本語 → 英語キー）
      const typeNormalize = (t) => {
        if (t === "新卒") return "newgrad";
        if (t === "中途" || t === "キャリア") return "career";
        return t;
      };
      const msg = new ChatMessage({
        applicationId: data.applicationId,
        applicationType: typeNormalize(data.applicationType),
        senderId: data.senderId,
        senderName: data.senderName,
        senderRole: data.senderRole,
        message: data.message || "",
        fileUrl: data.fileUrl || null,
        fileName: data.fileName || null,
        fileType: data.fileType || null
      });
      await msg.save();
      io.to(data.applicationId).emit("newMessage", {
        _id: msg._id,
        applicationId: msg.applicationId,
        senderId: msg.senderId,
        senderName: msg.senderName,
        senderRole: msg.senderRole,
        message: msg.message,
        fileUrl: msg.fileUrl,
        fileName: msg.fileName,
        fileType: msg.fileType,
        likes: [],
        edited: false,
        deleted: false,
        createdAt: msg.createdAt
      });
    } catch (e) {
      console.error("チャット保存エラー:", e);
    }
  });
});

// ポート実行
const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));