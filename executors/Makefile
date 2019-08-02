cloud-run:
	docker build -t colinjfw/cloud-run:latest -f cloud-run/Dockerfile .
	docker push colinjfw/cloud-run:latest
.PHONY: cloud-run

helm:
	docker build -t colinjfw/helm:latest -f helm/Dockerfile .
	docker push colinjfw/helm:latest
.PHONY: helm
