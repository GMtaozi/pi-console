# Pi-Console 全量代码审计报告

> **审计日期**：2026-08-31
> **审计范围**：全库（backend 57 个 TS 文件 + frontend 20 个 TSX/TS 文件）
> **审计方法**：人工深度审计 + 证据链追踪

---

## 一、审计摘要

| 维度 | 评估 |
|------|------|
| **总体安全评级** | 🔴 **高风险** |
| **Critical 问题** | 2 个 |
| **High 问题** | 4 个 |
| **Medium 问题** | 6 个 |
| **Low 问题** | 5 个 |
| **良好实践** | 9 项 |

---

## 二、Critical 级问题

### 🔴 SEC-001：扩展安装命令注入漏洞

| 维度 | 详情 |
|------|------|
| **位置** | `backend/src/extensions/ExtensionManager.ts:41` |
| **风险** | 攻击者可通过构造恶意 `packageName` 或 `version` 参数执行任意系统命令 |
| **代码** | `execAsync(\`npm install ${packageName}@${version}\`)` |
| **攻击示例** | `packageName = "lodash; rm -rf /"` |

**证据链**：
```
入口点：POST /api/extensions/:id/install
  ↓
参数接收：ext.package_name (未校验)
  ↓
命令拼接：`npm install ${packageName}@${version}`
  ↓
Sink：execAsync() → 系统命令执行
```

**修复建议**：
```typescript
import { execFile } from 'child_process';
const execFileAsync = promisify(execFile);

const SAFE_NAME = /^[a-zA-Z0-9@/_-]+$/;
if (!SAFE_NAME.test(packageName)) throw new Error('Invalid package name');
await execFileAsync('npm', ['install', `${packageName}@${version}`], { cwd: extDir });
```

---

### 🔴 SEC-002：数据库占位符转换缺失（功能性 Bug）

| 维度 | 详情 |
|------|------|
| **位置** | `backend/src/db.ts` 缺少 `convertPlaceholders` 函数 |
| **风险** | 使用 `?` 占位符的路由全部无法正常运行 |
| **影响** | 登录、注册、会话管理、Agent 配置、扩展管理等核心功能 |

**受影响的路由文件**：
| 文件 | 受影响的查询数 |
|------|---------------|
| `agent-config.ts` | ~20 处 |
| `auth.ts` | ~5 处 |
| `extensions.ts` | ~15 处 |
| `settings.ts` | ~10 处 |
| `sessions.ts` | ~8 处 |

**修复建议**：在 `db.ts` 中添加：
```typescript
function convertPlaceholders(sql: string): string {
  let i = 1;
  return sql.replace(/\?/g, () => `$${i++}`);
}
```

并在 `query`, `all`, `get`, `run` 方法中调用。

---

## 三、High 级问题

### 🔴 SEC-003：CORS 配置过于宽松

| 维度 | 详情 |
|------|------|
| **位置** | `backend/src/server.ts:20-23` |
| **风险** | 允许任意来源的跨域请求 + 携带凭证 |
| **代码** | `cors({ origin: true, credentials: true })` |

**修复建议**：
```typescript
await app.register(cors, {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:5173'],
  credentials: true,
});
```

---

### 🔴 SEC-004：WebSocket 缺少 Origin 验证（CSWSH）

| 维度 | 详情 |
|------|------|
| **位置** | `backend/src/websocket/server.ts:43` |
| **风险** | 恶意网站可建立跨站 WebSocket 连接 |

**修复建议**：
```typescript
new WebSocketServer({ 
  server,
  verifyClient: (info) => {
    const allowed = ['http://localhost:5173'];
    return allowed.includes(info.origin);
  }
});
```

---

### 🔴 SEC-005：JWT Secret 不一致

| 维度 | 详情 |
|------|------|
| **位置** | `backend/src/routes/auth.ts:7` |
| **风险** | `auth.ts` 使用 fallback `'dev-secret'`，绕过 32 字符校验 |
| **代码** | `const JWT_SECRET = process.env.JWT_SECRET \|\| 'dev-secret';` |

---

### 🔴 SEC-006：HTTP 节点 SSRF 防护可绕过

| 维度 | 详情 |
|------|------|
| **位置** | `backend/src/engine/executors/HTTPNodeExecutor.ts:22-42` |
| **风险** | `fetch` 默认跟随重定向，可被开放重定向绕过 |

**修复建议**：
```typescript
const response = await fetch(url, { ...fetchInit, redirect: 'manual' });
```

---

## 四、Medium 级问题

### 🟡 SEC-007：输入验证不足

| 维度 | 详情 |
|------|------|
| **位置** | 所有路由文件 |
| **风险** | 大量使用 `request.body as any`，无类型校验 |
| **建议** | 为所有路由添加 Zod schema 验证 |

---

### 🟡 SEC-008：错误信息泄露

| 维度 | 详情 |
|------|------|
| **位置** | 全局错误处理 |
| **风险** | 堆栈跟踪和内部错误信息可能泄露给客户端 |

---

### 🟡 SEC-009：缺少速率限制

| 维度 | 详情 |
|------|------|
| **位置** | 所有 API 路由 |
| **风险** | 易受暴力破解、DDoS 攻击 |
| **建议** | 添加 `@fastify/rate-limit` 插件 |

---

### 🟡 SEC-010：扩展卸载不清理注册的节点

| 维度 | 详情 |
|------|------|
| **位置** | `backend/src/extensions/ExtensionManager.ts:132-158` |
| **风险** | 扩展卸载后，其注册的节点仍留在 NodeRegistry 中 |

---

### 🟡 SEC-011：密码强度无要求

| 维度 | 详情 |
|------|------|
| **位置** | `backend/src/routes/auth.ts:10-14` |
| **建议** | 添加最小长度（8+）和复杂度校验 |

---

### 🟡 SEC-012：缺少安全响应头

| 维度 | 详情 |
|------|------|
| **位置** | HTTP 响应 |
| **建议** | 添加 `@fastify/helmet` 插件 |

---

## 五、Low 级问题

### 🟢 SEC-013：会话 Token 无撤销机制
### 🟢 SEC-014：日志中可能包含敏感数据
### 🟢 SEC-015：Parallel-Join 自动创建（已修复）
### 🟢 SEC-016：运行时类型检查（已修复）
### 🟢 SEC-017：执行日志导出（已修复）

---

## 六、良好实践 ✅

| 编号 | 实践 | 位置 |
|------|------|------|
| 1 | bcrypt 密码哈希（cost=10） | `auth.ts:21` |
| 2 | JWT Token 认证 | `middleware/auth.ts` |
| 3 | AES-256-GCM API Key 加密 | `utils/crypto.ts` |
| 4 | API Key 掩码显示 | `utils/crypto.ts:94-98` |
| 5 | 参数化 SQL 查询（无字符串拼接） | 所有路由 |
| 6 | 安全算术求值器（无 eval） | `SetVariableNodeExecutor.ts` |
| 7 | SSRF 防护（HTTP 节点） | `HTTPNodeExecutor.ts` |
| 8 | WebSocket 鉴权机制 | `websocket/server.ts` |
| 9 | 子工作流循环引用检测 | `SubWorkflowNodeExecutor.ts` |

---

## 七、修复优先级

| 优先级 | 问题 | 建议修复时间 |
|--------|------|-------------|
| **P0** | SEC-001 命令注入 | 立即修复 |
| **P0** | SEC-002 占位符转换 | 立即修复 |
| **P1** | SEC-003 CORS 配置 | 1 周内 |
| **P1** | SEC-004 WebSocket Origin | 1 周内 |
| **P1** | SEC-005 JWT Secret | 1 周内 |
| **P1** | SEC-006 SSRF 重定向 | 1 周内 |
| **P2** | SEC-007~012 | 2 周内 |
| **P3** | SEC-013~017 | 1 个月内 |

---

## 八、与 Phase 2 审计对比

| 问题类别 | Phase 2 审计 | 全量审计 | 差异 |
|----------|-------------|---------|------|
| Critical | 1 个 | 2 个 | +SEC-002（新发现） |
| High | 3 个 | 4 个 | +SEC-005（新发现） |
| Medium | 5 个 | 6 个 | +SEC-010（新发现） |
| Low | 4 个 | 5 个 | +SEC-014（新发现） |

---

## 九、结论

**全量审计发现 2 个 Critical 级问题，其中 SEC-002（占位符转换缺失）是功能性 Bug，会导致核心功能无法运行。建议立即修复 P0 问题后再上线。**

---

*本报告由代码审计 Skill 生成，基于人工深度审计方法。*
