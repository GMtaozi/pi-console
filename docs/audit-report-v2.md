# Pi-Console 全量代码审计报告

> **审计日期**：2026-09-01
> **审计对象**：D:\GitHub\pi-console（commit: current main）
> **审计范围**：全库（backend 61 个 TS 文件 + frontend 23 个 TSX/TS 文件，共 13201 行代码）
> **审计方式**：静态人工审计 + scan_repo.py 盘点 + 降级扫描模式（专业工具不可用）
> **审计维度**：安全 / 代码质量 / 性能 / 架构与合规

---

## 1. 执行摘要

**整体风险评分：35/100（中低风险）**

| 严重度 | 数量 | 说明 |
|--------|------|------|
| Critical | 0 | 无 |
| High | 0 | 无 |
| Medium | 3 | 计划修复 |
| Low | 2 | 酌情修复 |
| Info | 3 | 参考 |

### Top 关键发现

1. **加密密钥与 JWT Secret 同源派生**（SEC-015，Medium）— 一个用途泄露波及另一个
2. **Token 存储于 localStorage**（SEC-016，Medium）— XSS 可窃取 Token
3. **Token 通过 URL 参数传递**（SEC-017，Medium）— URL 可被日志记录

### 一句话总结

上一轮审计的 6 个 Critical/High 问题已全部修复。当前剩余风险集中在**前端 Token 存储方式**和**加密密钥管理**，无立即安全威胁。建议将 Token 迁移至 httpOnly Cookie，并将加密密钥与 JWT Secret 分离。

---

## 2. 审计范围与统计

### 代码库基线（来自 scan_repo.py）

- 总文件数：84 个
- 总代码行数：13201 行
- 语言构成：JavaScript/TypeScript 94%、SQL 3.6%、Web 1.2%、CSS 1.2%

### TOP 最大文件

| 文件 | 行数 |
|------|------|
| backend/src/engine/executeWorkflow.ts | 1120 |
| frontend/src/pages/WorkflowCanvas.tsx | 724 |
| backend/src/engine/__tests__/newExecutors.test.ts | 723 |
| frontend/src/pages/Templates.tsx | 593 |

### 审计覆盖

| 层级 | 模块数 | 审查方式 | 覆盖率 |
|------|--------|----------|--------|
| L1 热路径 | 12 | 全量深挖 | 100% |
| L2 业务逻辑 | 25 | 抽样 | ~60% |
| L3 基础设施 | 8 | 工具扫描 | 100% |

### 覆盖率台账（关键文件）

| 文件 | 层级 | 审计深度 | 状态 |
|------|------|----------|------|
| backend/src/server.ts | L1 | 逐函数 | 已深挖 |
| backend/src/db.ts | L1 | 逐函数 | 已深挖 |
| backend/src/middleware/auth.ts | L1 | 逐函数 | 已深挖 |
| backend/src/routes/auth.ts | L1 | 逐函数 | 已深挖 |
| backend/src/routes/sessions.ts | L1 | 逐函数 | 已深挖 |
| backend/src/routes/workflows.ts | L1 | 逐函数 | 已深挖 |
| backend/src/routes/extensions.ts | L1 | 逐函数 | 已深挖 |
| backend/src/routes/agent-config.ts | L1 | 逐函数 | 已深挖 |
| backend/src/routes/global-variables.ts | L1 | 逐函数 | 已深挖 |
| backend/src/engine/executeWorkflow.ts | L1 | 逐函数 | 已深挖 |
| backend/src/extensions/ExtensionManager.ts | L1 | 逐函数 | 已深挖 |
| backend/src/websocket/server.ts | L1 | 逐函数 | 已深挖 |
| backend/src/utils/crypto.ts | L1 | 逐函数 | 已深挖 |
| backend/src/services/llm.ts | L1 | 逐函数 | 已深挖 |
| frontend/src/services/api.ts | L1 | 逐函数 | 已深挖 |
| frontend/src/pages/WorkflowCanvas.tsx | L1 | 逐函数 | 已深挖 |
| frontend/src/pages/Settings.tsx | L2 | 抽样 | 已抽样 |
| frontend/src/pages/Sessions.tsx | L2 | 抽样 | 已抽样 |
| frontend/src/pages/Templates.tsx | L2 | 抽样 | 已抽样 |
| backend/src/engine/executors/*.ts | L2 | 抽样 | 已抽样 |
| backend/src/routes/templates.ts | L2 | 抽样 | 已抽样 |
| backend/src/routes/settings.ts | L2 | 抽样 | 已抽样 |
| backend/src/routes/nodes.ts | L2 | 抽样 | 已抽样 |
| backend/src/routes/executions.ts | L2 | 抽样 | 已抽样 |
| backend/src/cron/cleanup.ts | L3 | 模式扫描 | 已扫描 |
| docker-compose.yml | L3 | 模式扫描 | 已扫描 |
| Dockerfile | L3 | 模式扫描 | 已扫描 |

### 工具扫描结果

| 工具 | 可用性 | 执行结果 | 关键发现 |
|------|--------|----------|----------|
| gitleaks | 不可用 | 降级扫描（A1-A6 模式） | 4 个硬编码凭据候选（需核实） |
| npm audit | 不可用（npmmirror 不支持） | 未完成 | 建议补跑 |
| semgrep | 不可用 | 降级扫描（B 节模式） | 无危险函数命中 |

### 降级扫描发现

| 候选 | 位置 | 核实结果 |
|------|------|----------|
| 硬编码 DB 密码 | docker-compose.yml:29 | 演示环境默认值，非生产凭据 |
| 硬编码 DB 密码 | backend/.env:4 | 开发环境配置，未提交到仓库（.gitignore） |
| 硬编码 DB 密码 | backend/.env.example:4 | 示例文件，使用占位符 |
| DB 连接串 fallback | backend/src/db.ts:12 | 开发默认值，生产环境通过 env 注入 |

---

## 3. 发现清单

---

### SEC-015 加密密钥与 JWT Secret 同源派生 — Medium

- **维度**：安全 / 加密与密码学
- **层级**：L1 热路径
- **位置**：`backend/src/utils/crypto.ts:3-5`
- **严重度**：Medium（可能性:可能 × 影响:严重）
- **描述**：

AES-256-GCM 加密密钥 `ENC_KEY` 由 `JWT_SECRET` 通过 SHA256 哈希派生。这违反了密码学密钥分离原则——同一源密钥用于两个不同用途（JWT 签名 + 数据加密）。一旦 JWT_SECRET 被泄露（如日志、调试接口），所有加密的 API Key 也会被解密。此外，当 `JWT_SECRET` 未设置时，fallback 到 `'default-secret'` 会显著削弱加密强度。

- **证据**：

```typescript
// backend/src/utils/crypto.ts:3-5
const ENC_KEY = Buffer.from(
  crypto.createHash('sha256').update(process.env.JWT_SECRET || 'default-secret').digest('hex').slice(0, 32)
);
```

- **调用链**：

```
入口: 环境变量 JWT_SECRET
  ↓
派生: SHA256(JWT_SECRET).slice(0,32) → ENC_KEY
  ↓
用途1: jwt.sign/verify (JWT 签名)
用途2: crypto.createCipheriv(GCM, ENC_KEY) (API Key 加密)
  ↓
风险: JWT_SECRET 泄露 → ENC_KEY 被推导 → 所有加密数据可解密
```

- **影响分析**：JWT_SECRET 的泄露路径（日志、调试接口、错误响应）比 ENC_KEY 更多；两者绑定后，任一泄露即导致双重失守。

- **修复建议**：

```typescript
// 方案1: 使用独立的环境变量
const ENC_KEY = Buffer.from(process.env.ENC_KEY || crypto.randomBytes(32).toString('hex'), 'hex');

// 方案2: 使用 HKDF 从主密钥派生不同用途的子密钥
const masterKey = process.env.MASTER_KEY!;
const signingKey = crypto.hkdfSync('sha256', masterKey, 'jwt-signing', '', 32);
const encryptionKey = crypto.hkdfSync('sha256', masterKey, 'aes-encryption', '', 32);
```

- **回归测试**：

```typescript
// 验证加密/解密功能正常
const encrypted = encrypt('test-api-key');
const decrypted = decrypt(encrypted);
assert(decrypted === 'test-api-key');
```

- **验证步骤**：

```bash
# 1. 确认 ENC_KEY 独立于 JWT_SECRET
grep -n "ENC_KEY\|JWT_SECRET" backend/src/utils/crypto.ts
# 2. 运行测试
cd backend && npm test
```

- **状态**：未修复

---

### SEC-016 Token 存储于 localStorage — Medium

- **维度**：安全 / 认证与授权
- **层级**：L1 热路径
- **位置**：`frontend/src/services/api.ts:4`、`frontend/src/pages/WorkflowCanvas.tsx:35`
- **严重度**：Medium（可能性:可能 × 影响:高）
- **描述**：

用户认证 Token 存储在 `localStorage` 中，任何 XSS 攻击（包括未来引入的第三方脚本）都可以通过 `localStorage.getItem('token')` 窃取 Token，进而冒充用户身份调用所有 API。

- **证据**：

```typescript
// frontend/src/services/api.ts:4
function getToken() {
  return localStorage.getItem('token') || '';
}
```

- **调用链**：

```
用户登录 → Token 写入 localStorage
  ↓
XSS 攻击（未来可能引入）
  ↓
localStorage.getItem('token') → Token 泄露
  ↓
攻击者使用 Token 调用所有 API
```

- **影响分析**：当前项目未发现 XSS 漏洞，但 localStorage 存储方式使 Token 暴露面增大。一旦未来引入含漏洞的第三方库或出现 DOM XSS，Token 即被窃取。

- **修复建议**：

```typescript
// 方案1: 使用 httpOnly Cookie（推荐）
// 后端设置 Cookie：
reply.setCookie('token', token, {
  httpOnly: true,
  secure: true,
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60,
});
// 前端移除 localStorage，请求自动携带 Cookie

// 方案2: 使用 sessionStorage（关闭浏览器即失效，略优于 localStorage）
```

- **状态**：未修复

---

### SEC-017 Token 通过 URL 参数传递 — Medium

- **维度**：安全 / 敏感信息泄漏
- **层级**：L1 热路径
- **位置**：`frontend/src/pages/WorkflowCanvas.tsx:35`
- **严重度**：Medium（可能性:很可能 × 影响:中）
- **描述**：

WebSocket 连接时，Token 通过 URL 查询参数传递（`ws://host:3001?token=xxx`）。URL 中的敏感信息会被记录在浏览器历史、服务器访问日志、代理日志中，增加 Token 泄露风险。

- **证据**：

```typescript
// frontend/src/pages/WorkflowCanvas.tsx:35
return `${protocol}//${window.location.host.replace(/:\d+$/, '')}:3001?token=${localStorage.getItem('token') || ''}`;
```

- **影响分析**：Token 出现在 URL 中，任何能够访问浏览器历史、服务器日志或网络中间节点的实体都能获取 Token。

- **修复建议**：

```typescript
// 方案1: WebSocket 连接后通过 auth 消息认证（推荐）
// 连接时不带 token，连接建立后发送 auth 消息：
ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'authenticate', token: getToken() }));
});

// 方案2: 使用协议头（部分 WebSocket 库支持）
```

- **状态**：未修复

---

### SEC-018 演示账号硬编码 — Low

- **维度**：安全 / 认证与授权
- **层级**：L3 基础设施
- **位置**：`backend/src/db.ts:50-55`
- **严重度**：Low（可能性:可能 × 影响:中）
- **描述**：

数据库种子数据中硬编码了演示账号 `demo@pi.console / demo123`。如果生产环境未禁用种子逻辑，该账号会成为已知的后门入口。

- **证据**：

```typescript
// backend/src/db.ts:50-55
const hash = await bcrypt.hash('demo123', 10);
await pool.query(
  'INSERT INTO users (id, username, email, password_hash) VALUES ($1, $2, $3, $4)',
  [userId, 'demo', 'demo@example.com', hash]
);
```

- **修复建议**：

```typescript
// 方案1: 仅在开发环境种子
if (process.env.NODE_ENV === 'development') {
  // seed demo user
}

// 方案2: 通过环境变量控制
if (process.env.SEED_DEMO_USER === 'true') {
  // seed demo user
}
```

- **状态**：未修复

---

### SEC-019 生产代码中的调试输出 — Low

- **维度**：安全 / 敏感信息泄漏
- **层级**：L2 业务逻辑
- **位置**：多个文件
- **严重度**：Low
- **描述**：

生产代码中存在 `console.log` 输出，部分包含敏感信息（如种子用户密码）。

- **证据**：

```typescript
// backend/src/db.ts:55
console.log('[DB] Seeded demo user: demo@pi.console / demo123');
```

- **修复建议**：使用日志库（如 pino，Fastify 内置）替代 console.log，生产环境关闭 debug 级别日志。

- **状态**：未修复

---

## 4. 已修复问题确认（上一轮审计）

| ID | 问题 | 状态 | 验证位置 |
|----|------|------|----------|
| SEC-001 | 扩展安装命令注入 | 已修复 | ExtensionManager.ts:3,58-62（execFile + 输入校验） |
| SEC-002 | 数据库占位符转换缺失 | 已修复 | db.ts:157-160（convertPlaceholders 函数） |
| SEC-003 | CORS 配置过于宽松 | 已修复 | server.ts:26-34（ALLOWED_ORIGINS 白名单） |
| SEC-004 | WebSocket 缺少 Origin 验证 | 已修复 | websocket/server.ts:43-53（verifyClient） |
| SEC-005 | JWT Secret 不一致 | 已修复 | auth.ts:11-14（移除 fallback，统一校验） |
| SEC-006 | HTTP 节点 SSRF 重定向绕过 | 已修复 | HTTPNodeExecutor.ts:103（redirect: 'manual'） |

---

## 5. 对抗性自验证记录

| ID | 反驳角度核查结果 | 定级结论 |
|------|----------------|----------|
| SEC-015 | 可达性: JWT_SECRET 泄露路径存在（日志/调试接口）/ 版本: lockfile 一致 / 误读: 已重新读取核对 / 框架保护: 无 | 维持 Medium |
| SEC-016 | 可达性: 当前无 XSS 但 localStorage 暴露面大 / 版本: 已确认 / 误读: 已重新读取核对 / 框架保护: React 自动转义但不保护 localStorage | 维持 Medium |
| SEC-017 | 可达性: URL 可被日志记录，现实可达 / 版本: 已确认 / 误读: 已重新读取核对 / 框架保护: 无 | 维持 Medium |

### 已排除的候选

| 候选 | 排除理由 |
|------|----------|
| SQL 注入（sessions.ts search 参数） | 使用参数化查询，`?` 占位符经 convertPlaceholders 转换为 `$1`，安全 |
| 扩展安装命令注入 | 已使用 execFile + 输入白名单校验，风险已消除 |
| JWT alg:none | 使用 jsonwebtoken 库默认验签，未发现算法禁用 |

### 遗漏自查清单

- [x] 所有路由端点鉴权状态已逐个核对（全部有 authenticate）
- [x] 语言/技术栈清单中的危险函数已全部扫描
- [x] 前端已审计（XSS / Token 存储 / 敏感信息暴露）
- [x] 密钥维度完成（降级扫描）
- [x] 依赖漏洞维度未完成（npm audit 不可用，已在报告声明）

---

## 6. 修复路线图

| 优先级 | 发现 ID | 标题 | 严重度 | 修复成本 | 建议时间窗 |
|--------|---------|------|--------|----------|------------|
| P1 | SEC-015 | 加密密钥与 JWT Secret 同源派生 | Medium | 中 | 本迭代 |
| P1 | SEC-016 | Token 存储于 localStorage | Medium | 高 | 本迭代 |
| P1 | SEC-017 | Token 通过 URL 参数传递 | Medium | 低 | 本迭代 |
| P2 | SEC-018 | 演示账号硬编码 | Low | 低 | 排期 |
| P2 | SEC-019 | 生产代码调试输出 | Low | 低 | 排期 |

---

## 7. 可追踪 Checklist

### 安全
- [ ] SEC-015 — 加密密钥与 JWT Secret 分离 — 负责人:___ — 截止:___
- [ ] SEC-016 — Token 迁移至 httpOnly Cookie — 负责人:___ — 截止:___
- [ ] SEC-017 — WebSocket Token 改为 auth 消息传递 — 负责人:___ — 截止:___
- [ ] SEC-018 — 演示账号环境隔离 — 负责人:___ — 截止:___
- [ ] SEC-019 — 调试输出清理 — 负责人:___ — 截止:___

---

## 8. 附录

### A. 审计方法与工具

- **扫描脚本**：scan_repo.py（语言/规模统计、依赖识别、可疑模式候选、热路径定位）
- **专业工具**：gitleaks = 不可用，已用人工模式替代（模式：A1-A6）；semgrep = 不可用，已用人工模式替代（模式：B 节）；npm audit = 不可用（npmmirror 不支持），依赖核验未完成
- **深挖方式**：逐文件核实、调用链追踪、跨模块关联

### B. 观察与建议（非缺陷，Info 级）

1. **测试覆盖良好**：engine 目录下有全面的单元测试（dag/crypto/executeWorkflow/executors/variableResolver 等），新执行器测试覆盖 70+ 个用例
2. **架构设计合理**：节点注册机制（NodeRegistry/NodeExecutorRegistry）实现了开闭原则，新增节点无需修改核心引擎
3. **加密算法选择正确**：使用 AES-256-GCM（认证加密），优于 CBC 模式

### C. 未覆盖与限制

- **依赖漏洞扫描**：npm audit 不可用（镜像源不支持），未能核验 fastify/jsonwebtoken/bcryptjs/ws/pg 等核心依赖的已知 CVE。建议在生产部署前使用官方源补跑 `npm audit --registry=https://registry.npmjs.org`
- **git 历史密钥扫描**：gitleaks 不可用，仅扫描工作区当前状态，无法检测历史提交中的密钥泄露
- **跨文件数据流分析**：semgrep 不可用，人工追链可能漏掉间接路径
- **传递闭包漏洞**：devDependencies 的嵌套依赖未深度核验

### D. 降级扫描局限性声明

本次审计中，gitleaks、semgrep、npm audit 三个专业工具均不可用，已按 manual-fallback.md 执行人工降级扫描。降级扫描无法覆盖：
- gitleaks 的 git 历史全量扫描
- semgrep 的跨文件数据流分析
- CodeQL 级别的污点传播
- 依赖传递闭包漏洞分析

建议在 CI 中补装专业工具链，恢复完整扫描能力。
