"""
AgriGuard - Model Integration Script
Copies the trained TF.js model files into the web app and updates app.js.
"""

import os
import json
import shutil

PROJECT_DIR = os.path.dirname(__file__)
TFJS_MODEL_DIR = os.path.join(PROJECT_DIR, "tfjs_model")
WEB_MODEL_DIR = os.path.join(PROJECT_DIR, "model")


def integrate():
    print("\n🔗 Integrating trained model into AgriGuard web app...")
    print("=" * 60)

    # Check if model exists
    model_json = os.path.join(TFJS_MODEL_DIR, "model.json")
    class_names_file = os.path.join(TFJS_MODEL_DIR, "class_names.json")

    if not os.path.exists(model_json):
        print(f"❌ model.json not found in {TFJS_MODEL_DIR}")
        print("   Please run train_model.py first.")
        return

    # Copy model files to web-accessible folder
    os.makedirs(WEB_MODEL_DIR, exist_ok=True)
    for f in os.listdir(TFJS_MODEL_DIR):
        src = os.path.join(TFJS_MODEL_DIR, f)
        dst = os.path.join(WEB_MODEL_DIR, f)
        shutil.copy2(src, dst)
        print(f"   ✅ Copied: {f}")

    # Load class names
    with open(class_names_file, 'r') as f:
        class_names = json.load(f)

    print(f"\n📋 {len(class_names)} disease classes detected:")
    for idx, name in sorted(class_names.items(), key=lambda x: int(x[0])):
        print(f"   {int(idx)+1:2d}. {name}")

    print("\n" + "=" * 60)
    print("🎉 MODEL INTEGRATED SUCCESSFULLY!")
    print("=" * 60)
    print(f"\n   Model files are now in: {WEB_MODEL_DIR}/")
    print(f"   Deploy with: npx firebase-tools deploy --only hosting")
    print(f"\n   Your AgriGuard web app will now use the REAL AI model!")


if __name__ == '__main__':
    integrate()
