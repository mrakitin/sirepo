# -*- coding: utf-8 -*-
"""Common functionality that is shared between the server, supervisor, and driver.

Because this is going to be shared across the server, supervisor, and driver it
must be py2 compatible.

:copyright: Copyright (c) 2019 RadiaSoft LLC.  All Rights Reserved.
:license: http://www.apache.org/licenses/LICENSE-2.0.html
"""
from __future__ import absolute_import, division, print_function
from pykern import pkconfig
from pykern.pkcollections import PKDict
from pykern.pkdebug import pkdp, pkdc, pkdlog, pkdexc
import sirepo.util
import re


OP_ANALYSIS = 'analysis'
OP_CANCEL = 'cancel'
OP_CONDITION = 'condition'
OP_ERROR = 'error'
OP_KILL = 'kill'
OP_OK = 'ok'
#: Agent indicates it is ready
OP_ALIVE = 'alive'
OP_RUN = 'run'

#: path supervisor registers to receive messages from agent
AGENT_URI = '/agent'

#: requests from the agent
AGENT_ABS_URI = None

#: path supervisor registers to receive requests from server
SERVER_URI = '/server'

#: requests from the flask server
SERVER_ABS_URI = None

#: path supervisor registers to receive requests from job_process for file PUTs
DATA_FILE_URI = '/data-file'

#: how jobs request files
LIB_FILE_URI = '/lib-file'

#: how jobs request list of files (relative to `LIB_FILE_URI`)
LIB_FILE_LIST_URI = '/list.json'

#: where user lib file directories are linked for static download (job_supervisor)
LIB_FILE_ROOT = None

#: where user data files come in (job_supervisor)
DATA_FILE_ROOT = None

#: where job_processes request files lib files for api_runSimulation
LIB_FILE_ABS_URI = None

#: where job_process will PUT data files for api_downloadDataFile
DATA_FILE_ABS_URI = None

#: how jobs request files (relative to `srdb.root`)
SUPERVISOR_SRV_SUBDIR = 'supervisor-srv'

#: how jobs request files (absolute)
SUPERVISOR_SRV_ROOT = None

DEFAULT_IP = '127.0.0.1' # use v3.radia.run when testing sbatch
DEFAULT_PORT = 8001

RUNNER_STATUS_FILE = 'status'

UNIQUE_KEY_RE = re.compile(r'^\w$')

CANCELED = 'canceled'
COMPLETED = 'completed'
ERROR = 'error'
MISSING = 'missing'
PENDING = 'pending'
RUNNING = 'running'
#: Valid values for job status
STATUSES = frozenset((CANCELED, COMPLETED, ERROR, MISSING, PENDING, RUNNING))

SEQUENTIAL = 'sequential'
PARALLEL = 'parallel'

#: categories of jobs
KINDS = frozenset((SEQUENTIAL, PARALLEL))

cfg = None

def init():
    global cfg

    if cfg:
        return
    cfg = pkconfig.init(
        supervisor_uri=(
            'http://{}:{}'.format(DEFAULT_IP, DEFAULT_PORT),
            str,
            'supervisor base uri',
        ),
    )
    pkdc('cfg={}', cfg)
    global SUPERVISOR_SRV_ROOT, LIB_FILE_ROOT, DATA_FILE_ROOT, LIB_FILE_ABS_URI, DATA_FILE_ABS_URI, AGENT_ABS_URI, SERVER_ABS_URI

    SUPERVISOR_SRV_ROOT = sirepo.srdb.root().join(SUPERVISOR_SRV_SUBDIR)
    LIB_FILE_ROOT = SUPERVISOR_SRV_ROOT.join(LIB_FILE_URI[1:])
    DATA_FILE_ROOT = SUPERVISOR_SRV_ROOT.join(DATA_FILE_URI[1:])
    # trailing slash necessary
    LIB_FILE_ABS_URI = cfg.supervisor_uri + LIB_FILE_URI + '/'
    DATA_FILE_ABS_URI = cfg.supervisor_uri + DATA_FILE_URI + '/'
    AGENT_ABS_URI = cfg.supervisor_uri + AGENT_URI
    SERVER_ABS_URI = cfg.supervisor_uri + SERVER_URI


def subprocess_cmd_stdin_env(cmd, env, pyenv='py3', cwd='.', fork=False):
    """Convert `cmd` in `pyenv` with `env` to script and cmd

    Uses tempfile so the file can be closed after the subprocess
    gets the handle. You have to close `stdin` after calling
    `tornado.process.Subprocess`, which calls `subprocess.Popen`
    inline, since it' not ``async``.

    Args:
        cmd (iter): list of words to be quoted
        env (PKDict): environment to pass
        pyenv (str): python environment (py3 default)
        cwd (str): directory for the agent to run in (will be created if it doesn't exist)
        fork (bool): whether or not the subprocess should fork from the calling process

    Returns:
        tuple: new cmd (tuple), stdin (file), env (PKDict)
    """
    import os
    import tempfile
    env.pksetdefault(
        **pkconfig.to_environ((
            'pykern.*',
            'sirepo.feature_config.job_supervisor',
        ))
    )
    t = tempfile.TemporaryFile()
    c = ' '.join(("'{}'".format(x) for x in cmd))
    if fork:
        c = 'setsid ' + c + ' >& /dev/null'
# TODO(e-carlin): centos7 setsid doesn't have --fork
        # c = 'setsid --fork ' + c + ' >& /dev/null'
    else:
        c = 'exec ' + c
    # POSIT: we control all these values
    t.write(
        '''
set -e
mkdir -p '{}'
cd '{}'
pyenv shell {}
{}
{}
'''.format(
        cwd,
        cwd,
        pyenv,
        '\n'.join(("export {}='{}'".format(k, v) for k, v in env.items())),
        c,
    ).encode())
    t.seek(0)
    # it's reasonable to hardwire this path, even though we don't
    # do that with others. We want to make sure the subprocess starts
    # with a clean environment (no $PATH). You have to pass HOME.
    return ('/bin/bash', '-l'), t, PKDict(HOME=os.environ['HOME'])


def init_by_server(app):
    """Initialize module"""
    init()

    from sirepo import job_api
    from sirepo import uri_router

    uri_router.register_api_module(job_api)


def unique_key():
    return sirepo.util.random_base62(32)


#TODO(robnagler) consider moving this into pkdebug
class LogFormatter:
    """Convert arbitrary objects to length-limited strings"""

    #: maximum length of elements or total string
    MAX_STR = 2000

    #: maximum number of elements
    MAX_LIST = 10

    SNIP = '[...]'

    def __init__(self, obj):
        self.obj = obj

    def __repr__(self):
        def _s(s):
            s = str(s)
            return s[:self.MAX_STR] + (s[self.MAX_STR:] and self.SNIP)

        def _j(values, delims):
            v = list(values)
            return delims[0] + ' '.join(
                v[:self.MAX_LIST] + (v[self.MAX_LIST:] and [self.SNIP])
            ) + delims[1]

        if isinstance(self.obj, dict):
            return _j(
                (_s(k) + ': ' + _s(v) for k, v in self.obj.items() \
                    if k not in ('result', 'arg')),
                '{}',
            )
        if isinstance(self.obj, (tuple, list)):
            return _j(
                (_s(v) for v in self.obj),
                '[]' if isinstance(self.obj, list) else '()',
            )
        return _s(self.obj)
