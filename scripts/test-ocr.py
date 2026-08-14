#!/usr/bin/env python3
"""腾讯云 OCR 测试 — 识别教材第1页"""
import base64, json, os, sys
from tencentcloud.common import credential
from tencentcloud.common.exception.tencent_cloud_sdk_exception import TencentCloudSDKException
from tencentcloud.ocr.v20181119 import ocr_client, models

SECRET_ID = os.environ.get("TENCENT_SECRET_ID")
SECRET_KEY = os.environ.get("TENCENT_SECRET_KEY")
if not SECRET_ID or not SECRET_KEY:
    print("❌ 请设置环境变量: TENCENT_SECRET_ID / TENCENT_SECRET_KEY")
    sys.exit(1)

PDF = "/Users/apple/Desktop/学习资源/人教A版高中数学【电子课本】/人教A版数学必修第一册【高清教材】.pdf"

import fitz
doc = fitz.open(PDF)
page = doc[0]
pix = page.get_pixmap(dpi=200)
img_b64 = base64.b64encode(pix.tobytes("png")).decode()
doc.close()
print(f"📄 第1页, 图片 {len(img_b64)//1024}KB")

cred = credential.Credential(SECRET_ID, SECRET_KEY)
client = ocr_client.OcrClient(cred, "ap-guangzhou")
req = models.GeneralAccurateOCRRequest()
req.ImageBase64 = img_b64
resp = client.GeneralAccurateOCR(req)
result = json.loads(resp.to_json_string())

print(f"\n✅ 识别到 {len(result['TextDetections'])} 个文本块\n")
for i, t in enumerate(result["TextDetections"], 1):
    print(f"  {i:2d}. [{t['Confidence']:3d}%] {t['DetectedText']}")

os.makedirs("data/pipeline/raw", exist_ok=True)
with open("data/pipeline/raw/ocr_page1.json", "w", encoding="utf-8") as f:
    json.dump(result, f, ensure_ascii=False, indent=2)
print(f"\n📁 已保存 output/raw/ocr_page1.json")
