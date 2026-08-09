---
title: "CTF Writeup 模板与记录规范"
description: "一份适合 Web 题和靶场文章的 Markdown 模板，覆盖命令、请求、脚本与复盘。"
publishDate: 2026-08-09
updatedDate: 2026-08-09
tags:
  - ctf
  - web
  - writeup
pinned: false
draft: false
---

代码较多的 Writeup，最重要的是让读者能区分“观察到的现象、做出的判断和实际执行的操作”。我通常按下面的顺序记录。

## 1. 题目信息

先写清题目来源、分类、环境地址和附件。Flag、Token、Cookie 等敏感值使用占位符，不把仍然有效的凭证提交到公开仓库。

## 2. 信息收集

命令行代码块带上标题，输出与命令分开记录：

```bash title="scan.sh"
nmap -sC -sV -Pn -p- 10.10.10.10 -oN nmap.txt
```

```text title="nmap.txt"
PORT   STATE SERVICE VERSION
22/tcp open  ssh     OpenSSH
80/tcp open  http    nginx
```

## 3. 漏洞分析

HTTP 请求使用 `http` 语言标记，关键参数可以直接高亮：

```http title="request.http" {4}
POST /login HTTP/1.1
Host: challenge.example
Content-Type: application/x-www-form-urlencoded

username=admin&password=test
```

:::warning
复现生产环境漏洞前必须获得明确授权。博客中的地址、账号与 Flag 应做脱敏处理。
:::

## 4. 利用脚本

脚本应包含依赖、输入、失败处理和成功判据，而不只保留最终 Payload。

```python title="solve.py" {7-9}
import requests

TARGET = "https://challenge.example"

session = requests.Session()
response = session.get(f"{TARGET}/api/profile", timeout=10)
response.raise_for_status()

assert "uid" in response.json()
print(response.json())
```

## 5. 复盘

最后回答三个问题：漏洞为什么成立、哪一步最容易误判、真实环境中应如何修复。这样文章不只是命令流水账，也能在以后快速恢复思路。
