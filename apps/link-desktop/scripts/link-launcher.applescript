set rootdir to "/Users/pete/Desktop/Telnyx Link"
set logfile to "/tmp/telnyx-link-launcher.log"
set cmd to "nohup " & quoted form of (rootdir & "/script/build_and_run.sh") & " run >> " & quoted form of logfile & " 2>&1 &"
set wrapped to "/bin/zsh -lc " & quoted form of cmd
do shell script wrapped
