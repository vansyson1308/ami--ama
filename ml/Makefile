# Reproducible pipeline: make -C ml all   (seed 42; CPU is fine, ~1.5 h on 4 cores)
PY ?= python
.PHONY: all data prepare train evaluate export verify samples ood report v2 clean
all: data prepare train evaluate export verify samples
data:
	$(PY) download.py
prepare:
	$(PY) prepare.py
train:
	$(PY) train.py --arch mobilenetv3_large_100 --epochs 9 --freeze-epochs 1 --max-minutes 120
evaluate:
	$(PY) evaluate.py --backend torch --model checkpoints/best.pt --tag torch_fp32
export:
	$(PY) export.py
	$(PY) evaluate.py --backend onnx --model checkpoints/leaf_fp32.onnx --tag onnx_fp32
	$(PY) evaluate.py --backend onnx --model checkpoints/leaf_int8_static.onnx --tag onnx_int8_static
	$(PY) evaluate.py --backend onnx --model checkpoints/leaf_int8_static_pct.onnx --tag onnx_int8_static_pct
	$(PY) evaluate.py --backend onnx --model checkpoints/leaf_int8_dynamic.onnx --tag onnx_int8_dynamic
	$(PY) evaluate.py --backend onnx --model checkpoints/leaf_int8_weights.onnx --tag onnx_int8_weights
	$(PY) finalize.py
verify:
	$(PY) verify_onnx.py
samples:
	$(PY) make_samples.py
	$(PY) ood_check.py
	$(PY) report_md.py
ood:
	$(PY) ood_check.py
report:
	$(PY) report_md.py
# leaf_v2 = leaf_v1 + openly licensed Commons negatives (fine-tune), staged in checkpoints/v2 + reports/v2;
# compare_v2.py applies the pre-registered merge rule; promotion = copy reports/v2/public/* to ../public/models.
v2:
	$(PY) collect_negatives.py
	PY=$(PY) ./run_v2.sh
	$(PY) compare_v2.py
clean:
	rm -rf checkpoints reports/*.npz
