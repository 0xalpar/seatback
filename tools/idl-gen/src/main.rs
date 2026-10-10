fn main() -> anyhow::Result<()> {
    let root = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..").canonicalize()?;
    let idl = anchor_lang_idl::build::IdlBuilder::new()
        .program_path(root.join("programs/seatback")).cargo_args(vec!["--locked".into()]).build()?;
    std::fs::create_dir_all(root.join("packages/chain-client/idl"))?;
    std::fs::write(root.join("packages/chain-client/idl/seatback.json"),
        serde_json::to_string_pretty(&idl)? + "\n")?;
    Ok(())
}
