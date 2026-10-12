FROM ubuntu:24.04
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates bzip2 curl libssl3t64 libudev1 && rm -rf /var/lib/apt/lists/*
# Official pinned Agave archive prepared in the ignored local build context.
COPY agave.tar.bz2 /tmp/agave.tar.bz2
RUN echo 'c43539ebdf6942472e8b87635d6ea55f428a51e3d0219f7b6f720fc6b19fade0  /tmp/agave.tar.bz2' | sha256sum -c - && tar -xjf /tmp/agave.tar.bz2 -C /opt && rm /tmp/agave.tar.bz2 && /opt/solana-release/bin/solana-test-validator --version
ENV PATH=/opt/solana-release/bin:$PATH
ENTRYPOINT ["solana-test-validator"]
