# line-lab

Compute for a generative line project: a walk built on the sigma-lognormal model of handwriting, an image judge (DINOv2 features plus a linear probe) trained on good/bad labels of 8-second line windows, and searches that steer the walk with that judge. Everything runs on GitHub Actions (`.github/workflows/distill.yml`, stages `onnx`, `batch`, `qd`, `bc`).
