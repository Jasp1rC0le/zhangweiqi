<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
const router = useRouter()
onMounted(() => router.replace({ path: '/chat', query: { pro: '1' } }))
</script>
<template><span class="sr-only" role="status">正在打开 Pro 介绍</span></template>
