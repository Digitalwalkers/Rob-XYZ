FEATURES = {
    "error_code.occurrence": {
        "label": "错误码事件",
        "shape": "point",
        "timing": "sync",
        "color": "#ef4444",
        "severity": "high",
    },
    "battery_device.compound_alert": {
        "label": "低电量+设备异常",
        "shape": "segment",
        "timing": "sync",
        "color": "#f97316",
        "severity": "high",
    },
    "speed.idle": {
        "label": "静止区间",
        "shape": "segment",
        "timing": "sync",
        "color": "#6b7280",
        "severity": "info",
    },
    "device_a.error_segments": {
        "label": "设备A故障区间",
        "shape": "segment",
        "timing": "sync",
        "color": "#dc2626",
        "severity": "medium",
    },
    "device_b.error_segments": {
        "label": "设备B故障区间",
        "shape": "segment",
        "timing": "sync",
        "color": "#b91c1c",
        "severity": "medium",
    },
    "battery.critical": {
        "label": "电量极低",
        "shape": "segment",
        "timing": "sync",
        "color": "#ea580c",
        "severity": "high",
    },
    "speed.rapid_drop": {
        "label": "速度骤降",
        "shape": "segment",
        "timing": "async",
        "color": "#7c3aed",
        "severity": "medium",
    },
}

SYNC_FEATURES = [k for k, v in FEATURES.items() if v["timing"] == "sync"]
ASYNC_FEATURES = [k for k, v in FEATURES.items() if v["timing"] == "async"]
