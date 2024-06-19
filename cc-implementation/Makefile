.PHONY: install
install:
	npm install

.PHONY: build
build: install
	npm run build && PUSHTX_SINGLE_FILE=1 npm run build

# hash and sign all important files - both the source and built versions
.PHONY: sign
sign:
	find . -type f \
  \( -iname '*.js' -o -iname '*.ts' -o -iname '*.html' -o -iname '*.css' -o -iname '*.json' \)  \
	! -path './node_modules/*' \
	-exec shasum -a 256 {} \; > SHA256SUMS && \
	gpg --detach-sign --armor --digest-algo SHA256 --yes SHA256SUMS
