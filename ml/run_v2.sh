#!/usr/bin/env bash
# Candidate v2: fine-tune leaf_v1 with extra openly licensed negatives; everything goes to checkpoints/v2 and
# reports/v2 (staging model in reports/v2/public) so the shipped v1 is untouched until the merge decision.
set -euo pipefail
cd "$(dirname "$0")"
PY=${PY:-python}
export AMI_CKPT=checkpoints/v2 AMI_REPORTS=reports/v2 AMI_PUBLIC=reports/v2/public AMI_VERSION=leaf_v2
mkdir -p "$AMI_CKPT" "$AMI_REPORTS" "$AMI_PUBLIC"
$PY prepare.py
$PY train.py --arch mobilenetv3_large_100 --init checkpoints/best.pt --epochs 3 --freeze-epochs 0 \
  --lr-backbone 1e-4 --lr-head 3e-4 --max-minutes 45
$PY export.py
$PY evaluate.py --backend onnx --model "$AMI_CKPT/leaf_fp32.onnx" --tag onnx_fp32
$PY evaluate.py --backend onnx --model "$AMI_CKPT/leaf_int8_weights.onnx" --tag onnx_int8_weights
$PY finalize.py
$PY ood_check.py
