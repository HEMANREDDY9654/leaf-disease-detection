"""
AgriGuard - Crop Disease Detection Model Training Script
Uses PlantVillage dataset from Kaggle with MobileNetV2 Transfer Learning.
Exports trained model to TensorFlow.js format for browser use.
"""

import os
import json
import numpy as np
import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.layers import Dense, GlobalAveragePooling2D, Dropout
from tensorflow.keras.models import Model
from tensorflow.keras.preprocessing.image import ImageDataGenerator
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau

# ============================================
# CONFIG — Change these if needed
# ============================================
DATASET_DIR = os.path.join(os.path.dirname(__file__), "dataset", "PlantVillage")
MODEL_SAVE_DIR = os.path.join(os.path.dirname(__file__), "trained_model")
TFJS_MODEL_DIR = os.path.join(os.path.dirname(__file__), "tfjs_model")
IMG_SIZE = 224
BATCH_SIZE = 32
EPOCHS = 10  # Good for transfer learning; increase for more accuracy

def download_dataset():
    """Download PlantVillage dataset from Kaggle."""
    print("\n📥 Step 1: Downloading PlantVillage dataset from Kaggle...")
    print("=" * 60)

    dataset_parent = os.path.join(os.path.dirname(__file__), "dataset")
    os.makedirs(dataset_parent, exist_ok=True)

    # Check if already downloaded
    if os.path.exists(DATASET_DIR) and len(os.listdir(DATASET_DIR)) > 5:
        print(f"✅ Dataset already exists at: {DATASET_DIR}")
        print(f"   Found {len(os.listdir(DATASET_DIR))} disease classes.")
        return True

    try:
        import kaggle
        kaggle.api.authenticate()
        print("🔑 Kaggle authenticated successfully.")
        print("⬇️  Downloading... (this may take 5-10 minutes)")
        kaggle.api.dataset_download_files(
            'abdallahalidev/plantvillage-dataset',
            path=dataset_parent,
            unzip=True
        )
        print("✅ Download complete!")

        # The dataset extracts into various folder structures
        # Try to find the right folder
        for root, dirs, files in os.walk(dataset_parent):
            if len(dirs) > 10:  # PlantVillage has 38 classes
                if root != dataset_parent:
                    # Move or rename to expected path
                    os.rename(root, DATASET_DIR)
                break

        return True
    except ImportError:
        print("❌ 'kaggle' package not installed. Run: pip install kaggle")
        return False
    except Exception as e:
        print(f"❌ Error downloading: {e}")
        print("\n📋 Manual download instructions:")
        print("   1. Go to: https://www.kaggle.com/datasets/abdallahalidev/plantvillage-dataset")
        print("   2. Click 'Download'")
        print(f"   3. Extract the ZIP into: {dataset_parent}")
        print(f"   4. Make sure the folder structure is: {DATASET_DIR}/<disease_folders>/<images>")
        return False


def create_model(num_classes):
    """Create MobileNetV2 transfer learning model."""
    print("\n🧠 Step 2: Creating MobileNetV2 model...")
    print("=" * 60)

    base_model = MobileNetV2(
        weights='imagenet',
        include_top=False,
        input_shape=(IMG_SIZE, IMG_SIZE, 3)
    )

    # Freeze base layers for transfer learning
    base_model.trainable = False

    # Add custom classification head
    x = base_model.output
    x = GlobalAveragePooling2D()(x)
    x = Dropout(0.3)(x)
    x = Dense(128, activation='relu')(x)
    x = Dropout(0.2)(x)
    predictions = Dense(num_classes, activation='softmax')(x)

    model = Model(inputs=base_model.input, outputs=predictions)

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )

    print(f"✅ Model created with {num_classes} output classes.")
    print(f"   Total parameters: {model.count_params():,}")
    return model


def train_model():
    """Main training pipeline."""
    print("\n" + "=" * 60)
    print("🌿 AgriGuard AI Model Training Pipeline")
    print("=" * 60)

    # Step 1: Download dataset
    if not download_dataset():
        return

    # Check dataset
    if not os.path.exists(DATASET_DIR):
        print(f"\n❌ Dataset not found at: {DATASET_DIR}")
        print("   Please download manually (see instructions above).")
        return

    # Get class names
    class_names = sorted([d for d in os.listdir(DATASET_DIR)
                          if os.path.isdir(os.path.join(DATASET_DIR, d))])
    num_classes = len(class_names)
    print(f"\n📊 Found {num_classes} disease classes:")
    for i, name in enumerate(class_names):
        folder = os.path.join(DATASET_DIR, name)
        count = len([f for f in os.listdir(folder) if f.lower().endswith(('.jpg', '.jpeg', '.png'))])
        print(f"   {i+1:2d}. {name} ({count} images)")

    # Step 2: Prepare data generators
    print("\n📦 Step 3: Preparing data...")
    print("=" * 60)

    datagen = ImageDataGenerator(
        rescale=1.0 / 255,
        validation_split=0.2,
        rotation_range=20,
        horizontal_flip=True,
        zoom_range=0.15,
        fill_mode='nearest'
    )

    train_gen = datagen.flow_from_directory(
        DATASET_DIR,
        target_size=(IMG_SIZE, IMG_SIZE),
        batch_size=BATCH_SIZE,
        class_mode='categorical',
        subset='training',
        shuffle=True
    )

    val_gen = datagen.flow_from_directory(
        DATASET_DIR,
        target_size=(IMG_SIZE, IMG_SIZE),
        batch_size=BATCH_SIZE,
        class_mode='categorical',
        subset='validation',
        shuffle=False
    )

    print(f"✅ Training samples: {train_gen.samples}")
    print(f"✅ Validation samples: {val_gen.samples}")

    # Step 3: Create model
    model = create_model(num_classes)

    # Step 4: Train
    print("\n🚀 Step 4: Training model...")
    print("=" * 60)
    print(f"   Epochs: {EPOCHS}")
    print(f"   Batch size: {BATCH_SIZE}")
    print("   This may take 30-60 minutes on CPU.\n")

    callbacks = [
        EarlyStopping(monitor='val_loss', patience=3, restore_best_weights=True),
        ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=2)
    ]

    history = model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=EPOCHS,
        callbacks=callbacks
    )

    # Step 5: Save Keras model
    print("\n💾 Step 5: Saving model...")
    print("=" * 60)
    os.makedirs(MODEL_SAVE_DIR, exist_ok=True)
    model_path = os.path.join(MODEL_SAVE_DIR, "crop_disease_model.h5")
    model.save(model_path)
    print(f"✅ Keras model saved: {model_path}")

    # Save class names mapping
    class_map = {str(v): k for k, v in train_gen.class_indices.items()}
    class_map_path = os.path.join(MODEL_SAVE_DIR, "class_names.json")
    with open(class_map_path, 'w') as f:
        json.dump(class_map, f, indent=2)
    print(f"✅ Class names saved: {class_map_path}")

    # Step 6: Convert to TensorFlow.js
    print("\n🔄 Step 6: Converting to TensorFlow.js format...")
    print("=" * 60)
    try:
        import tensorflowjs as tfjs
        os.makedirs(TFJS_MODEL_DIR, exist_ok=True)
        tfjs.converters.save_keras_model(model, TFJS_MODEL_DIR)

        # Copy class names to tfjs folder too
        import shutil
        shutil.copy(class_map_path, os.path.join(TFJS_MODEL_DIR, "class_names.json"))

        print(f"✅ TensorFlow.js model saved: {TFJS_MODEL_DIR}")
        print(f"   Files: {os.listdir(TFJS_MODEL_DIR)}")
    except ImportError:
        print("❌ tensorflowjs not installed. Run: pip install tensorflowjs")
        print(f"   Then manually convert: tensorflowjs_converter --input_format keras {model_path} {TFJS_MODEL_DIR}")

    # Final summary
    val_acc = max(history.history.get('val_accuracy', [0]))
    print("\n" + "=" * 60)
    print("🎉 TRAINING COMPLETE!")
    print("=" * 60)
    print(f"   Best Validation Accuracy: {val_acc:.2%}")
    print(f"   Number of Disease Classes: {num_classes}")
    print(f"   Keras Model: {model_path}")
    print(f"   TF.js Model: {TFJS_MODEL_DIR}")
    print(f"\n   Next step: Run 'python integrate_model.py' to update your web app.")


if __name__ == '__main__':
    train_model()
