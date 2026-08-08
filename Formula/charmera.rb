class Charmera < Formula
  desc "AI photo organizer for keychain cameras - import, label, and rename photos locally"
  homepage "https://h3qing.github.io/Kodak-Charmera-Companion/"
  url "https://github.com/h3qing/Kodak-Charmera-Companion/archive/refs/tags/v0.6.0.tar.gz"
  # TODO: replace with the real digest once v0.6.0 is published. Get it with:
  #   curl -sL https://github.com/h3qing/Kodak-Charmera-Companion/archive/refs/tags/v0.6.0.tar.gz | shasum -a 256
  # The placeholder below will fail `brew install` until it is filled in.
  sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  license "MIT"
  head "https://github.com/h3qing/Kodak-Charmera-Companion.git", branch: "main"

  depends_on "rust" => :build

  def install
    system "cargo", "install", *std_cargo_args(path: "crates/charmera-cli")
    man1.install "docs/man/charmera.1"
  end

  def caveats
    <<~EOS
      charmera runs its AI labelling entirely on your machine through Ollama.
      Commands like `label`, `rename` and `batch-label` will fail at runtime
      until Ollama is installed, running, and has a vision model pulled:

        brew install ollama
        ollama serve          # or: brew services start ollama
        ollama pull moondream

      Everything else (import, list, info, status, detect, splash) works
      without Ollama.

      Verify your setup with:

        charmera status

      This formula installs the `charmera` CLI only. The Charmera Companion
      desktop app is distributed as a .dmg on the releases page:
        https://github.com/h3qing/Kodak-Charmera-Companion/releases
    EOS
  end

  test do
    assert_match "charmera", shell_output("#{bin}/charmera --version")
    # `status` must work without a camera or Ollama present.
    assert_match "Charmera", shell_output("#{bin}/charmera status")
  end
end
