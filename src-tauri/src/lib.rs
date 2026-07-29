use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::Instant;
use tauri_plugin_sql::{Migration, MigrationKind};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HeaderItem {
    key: String,
    value: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HttpRequestPayload {
    method: String,
    url: String,
    headers: Vec<HeaderItem>,
    body: Option<String>,
    /// 内网自签证书场景可开启（仅限可信内网）
    insecure: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HttpResponsePayload {
    status: u16,
    status_text: String,
    headers: HashMap<String, String>,
    body: String,
    duration_ms: u64,
    error: Option<String>,
}

#[tauri::command]
async fn http_send(payload: HttpRequestPayload) -> Result<HttpResponsePayload, String> {
    let insecure = payload.insecure.unwrap_or(false);
    let method = payload.method.trim().to_uppercase();
    if payload.url.trim().is_empty() {
        return Err("请填写请求 URL".into());
    }

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(insecure)
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| format!("创建 HTTP 客户端失败: {e}"))?;

    let http_method = reqwest::Method::from_bytes(method.as_bytes())
        .map_err(|_| format!("不支持的请求方法: {method}"))?;

    let mut request = client.request(http_method, payload.url.trim());

    for header in &payload.headers {
        let key = header.key.trim();
        if key.is_empty() {
            continue;
        }
        request = request.header(key, &header.value);
    }

    if let Some(body) = &payload.body {
        if !body.is_empty() {
            request = request.body(body.clone());
        }
    }

    let started = Instant::now();
    let response = request.send().await.map_err(|e| format!("请求失败: {e}"))?;
    let duration_ms = started.elapsed().as_millis() as u64;

    let status = response.status();
    let status_code = status.as_u16();
    let status_text = status
        .canonical_reason()
        .unwrap_or("")
        .to_string();

    let mut headers = HashMap::new();
    for (key, value) in response.headers().iter() {
        headers.insert(
            key.to_string(),
            value.to_str().unwrap_or("").to_string(),
        );
    }

    let body = response
        .text()
        .await
        .map_err(|e| format!("读取响应失败: {e}"))?;

    Ok(HttpResponsePayload {
        status: status_code,
        status_text,
        headers,
        body,
        duration_ms,
        error: None,
    })
}

fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "init_tinypost_schema",
        sql: r#"
CREATE TABLE IF NOT EXISTS request_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  request_headers TEXT NOT NULL DEFAULT '[]',
  request_body TEXT NOT NULL DEFAULT '',
  status INTEGER,
  response_headers TEXT NOT NULL DEFAULT '{}',
  response_body TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS environments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  variables TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS saved_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  collection_id INTEGER,
  name TEXT NOT NULL,
  method TEXT NOT NULL,
  url TEXT NOT NULL,
  headers TEXT NOT NULL DEFAULT '[]',
  body TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE SET NULL
);
"#,
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:tinypost.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![http_send])
        .run(tauri::generate_context!())
        .expect("error while running TinyPost");
}
