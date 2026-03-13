// --- AI Trainer Logic ---
let net;
const classifier = knnClassifier.create();
const classImages = [[], []]; // Stores image elements for each class

async function loadApp() {
    console.log("Loading modules...");
    net = await mobilenet.load();
    console.log("Modules loaded.");
    document.getElementById('status').classList.remove('hidden');
    document.getElementById('status-text').textContent = "Model loaded. Ready to add images!";
}

window.handleImageUpload = (event, classIndex) => {
    const files = event.target.files;
    const previewDiv = document.getElementById(`preview-${classIndex}`);
    const countSpan = document.getElementById(`count-${classIndex}`);

    for (let file of files) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.src = e.target.result;
            img.className = 'thumbnail';
            img.onload = () => {
                const icon = document.createElement('img');
                icon.src = img.src;
                icon.className = 'thumbnail';
                previewDiv.appendChild(icon);
                classImages[classIndex].push(img);

                // Update counter
                if (countSpan) countSpan.textContent = classImages[classIndex].length;
            };
        };
        reader.readAsDataURL(file);
    }
};

document.getElementById('train-btn').onclick = async () => {
    const statusText = document.getElementById('status-text');
    statusText.textContent = "Training... (Analyzing images)";

    for (let i = 0; i < classImages.length; i++) {
        if (classImages[i].length === 0) {
            alert(`Please upload at least one image for Class ${i + 1}`);
            statusText.textContent = "Training halted: missing images.";
            return;
        }

        for (let img of classImages[i]) {
            // Get activation features from MobileNet
            const activation = net.infer(img, true);
            // Add to classifier
            classifier.addExample(activation, i);
        }
    }

    statusText.textContent = "Training complete! Your Custom AI is now ready.";
    document.getElementById('download-btn').classList.remove('hidden');

    // Save to local storage so the main app can use it
    const dataset = classifier.getClassifierDataset();
    var datasetObj = {};
    Object.keys(dataset).forEach((key) => {
        let data = dataset[key].dataSync();
        datasetObj[key] = Array.from(data);
    });
    localStorage.setItem('my-custom-model', JSON.stringify(datasetObj));

    alert("AI Model Trained Successfully! It has been saved to your browser's local storage.");
};

document.getElementById('download-btn').onclick = () => {
    const data = localStorage.getItem('my-custom-model');
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model_dataset.json';
    a.click();
};

loadApp();
