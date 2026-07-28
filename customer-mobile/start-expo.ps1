$nodeBin = "C:\Users\example\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
$pnpmCli = "C:\Users\example\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules\pnpm\bin\pnpm.cjs"

$env:Path = "$nodeBin;$env:Path"
& "$nodeBin\node.exe" $pnpmCli start -- --host lan
