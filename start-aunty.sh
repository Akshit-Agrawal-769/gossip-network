echo -n "Which aunty is this laptop? (e.g. Sharma Aunty): "
read AUNTY_NAME
if [ -z "$AUNTY_NAME" ]; then
  AUNTY_NAME="Sharma Aunty"

fi

export AUNTY_NAME

node server.js

