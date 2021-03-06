const express = require('express')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const mergeSignDoc = require('../utils/mergeSignDoc')

const documentModel = require('../models/documentModel')

const router = express.Router()

// 文档存储路径
const dirDocsPath = path.join(__dirname, '..', 'public/upload/docs').replace(/\\/g, '/')
// 配置存储路径和文件名 
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (!fs.existsSync(dirDocsPath)) {
            fs.mkdir(dirDocsPath, function (err) {
                if (err) {
                    console.log(err)
                } else {
                    cb(null, dirDocsPath)
                }
            })
        } else {
            cb(null, dirDocsPath)
        }
    },
    filename: function (req, file, cb) {
        // originalname 上传时的文件名 下面是取出扩展名
        var ext = path.extname(file.originalname)
        cb(null, file.fieldname + '-' + Date.now() + ext)
    }
})
// 文件过滤 未找到使用方式
const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname)
    if(ext !== '.pdf'){
        cb(new Error('只支持上传pdf文件类型！'), false)
    } else {
        cb(null, true)
    }
}
// 文件上传限制
const limits = { fileSize: '5MB' }
// 根据配置 创建multer对象
const upload = multer({ storage, limits, fileFilter })
// 表单的name属性值
const uploadSingle = upload.single('file')

// 文件上传
router.post('/upload', (req, res, next) => {
    uploadSingle(req, res, function (err) {
        if (err) { // upload err
            return res.send({
                status: 1,
                msg: err
            })
        }
        // upload success
        var file = req.file
        var {creator_id} = req.query
        const fileInfo = {
            doc_id: file.filename,
            doc_name: file.originalname,
            doc_path: dirDocsPath,
            create_time: Date.now(),
            doc_status: 'unpublish', // 未发布状态
            creator_id
        }
        documentModel.create(fileInfo)
            .then(() => { // 写入数据库成功
                res.send({
                    status: 0,
                    data: fileInfo,
                })
            })
            .catch(err => { // 写入数据库失败
                console.log(err)
                res.send({
                    status: 2,
                    msg: '上传文件失败'
                })
            })
    })
})

// 文件删除
router.post('/delete', (req, res) => {
    const { doc_id } = req.body
    // 删除数据库中的文件数据
    documentModel.delete(doc_id)
    .then(() => {
        // 删除磁盘中的文件
        fs.unlink(path.join(dirDocsPath, doc_id), (err) => {
            if (err) {
                console.log(err)
                res.send({
                    status: 1,
                    msg: '删除文件失败'
                })
            } else {
                res.send({
                    status: 0,
                    msg: '删除文件成功'
                })
            }
        })

    })
    .catch(err => {
        console.log(err)
        res.send({
            status: 2,
            msg: '删除文件失败'
        })
    })
})

// 文档预发布，保存设置信息 basic
router.post('/release/basic', (req, res, next) => {
    const updateOptions = req.body
    const {doc_id} = updateOptions
    console.log(doc_id)
    // 文档是否存在
    documentModel.findOne(doc_id, 'unpublish')
    .then(item => {
        if(item.doc_id){// exists doc, update doc_id
            documentModel.prepareReleaseUpdate(updateOptions)
            .then(doc => {
                res.send({status:0, data:doc})
            })
            .catch(err => {
                console.log(err)
                res.send({status:2, msg:'数据库操作出错'})
            })
        } else {
            res.send({status:1, msg:'文档不存在或已经发布、结束'})
        }
    })
    .catch(err => {
        console.log(err)
        res.send({status:2, msg:'数据库操作出错'})
    })
})

// 设置签署面签区域 sign-area
router.post('/release/sign-area', (req, res, next) => {
    const signArea = req.body
    const {sign_area, doc_id} = signArea
    console.log(sign_area, doc_id)
    // 文档是否存在
    documentModel.findOne(doc_id, 'unpublish')
    .then(item => {
        if(item.doc_id){// exists doc, update doc_id
            documentModel.signAreaUpdate(signArea)
            .then(doc => {
                res.send({status:0, data:doc})
            })
            .catch(err => {
                console.log(err)
                res.send({status:2, msg:'数据库操作出错'})
            })
        } else {
            res.send({status:1, msg:'文档不存在或已经发布、结束'})
        }
    })
    .catch(err => {
        console.log(err)
        res.send({status:2, msg:'数据库操作出错'})
    })
})

// 面签发布 confirm
router.post('/release/confirm', (req, res, next) => {
    const endOptions = req.body
    const {doc_id} = endOptions
    console.log(doc_id, endOptions)
    // 文档是否存在
    documentModel.findOne(doc_id, 'unpublish')
    .then(item => {
        if(item.doc_id){// exists doc, update doc_id
            documentModel.releaseDocUpdate(endOptions)
            .then(doc => {
                res.send({status:0, data:doc})
            })
            .catch(err => {
                console.log(err)
                res.send({status:2, msg:'数据库操作出错'})
            })
        } else {
            res.send({status:1, msg:'文档不存在或已经发布、结束'})
        }
    })
    .catch(err => {
        console.log(err)
        res.send({status:2, msg:'数据库操作出错'})
    })
})
// 面签结束
router.post('/sign-end', (req, res, next) => {
    // 设置文档状态为end 
    const {doc_id, end_time, doc_path, sign_area} = req.body
    console.log('sign-end', doc_id, end_time, sign_area)
    documentModel.findOne(doc_id)
    .then(item => {
        if(item){// exists doc, update doc_id
            // 合成签署的文档
            mergeSignDoc({doc_id, doc_path, sign_area})
            .then(() => { // 签名与文档合并成功
                // 更改文档状态
                documentModel.signEndUpdate(doc_id, end_time)
                .then(doc => {
                    res.send({status:0, data:doc})
                })
                .catch(err => {
                    console.log(err)
                    res.send({status:2, msg:'数据库操作出错'})
                })
            })
            .catch(err => {
                console.log(err)
                res.send({status:3, msg:'合并失败'})
            })
        } else {
            res.send({status:1, msg:'文档不存在'})
        }
    })
    .catch(err => {
        console.log(err)
        res.send({status:2, msg:'数据库操作出错'})
    })
})

// 根据doc_status获取文档列表供前台显示
router.get('/list', (req, res, next) => {
    const {doc_status, time_type, creator_id} = req.query
    console.log(doc_status, time_type)
    documentModel.find(doc_status, time_type, creator_id)
    .then(results => {
        res.send({
            status:0,
            length:results.length,
            data:results
        })
    })
    .catch(err => {
        console.log(err)
        res.send({
            status:1,
            msg:'服务器错误！'
        })
    })
})
// 获取签署的文档信息 info
router.get('/info', (req, res, next) => {
    const {doc_id} = req.query
    console.log(doc_id)
    documentModel.findOne(doc_id)
    .then(doc => {
        res.send({
            status:0,
            data:doc
        })
    })
    .catch(err => {
        console.log(err)
        res.send({
            status:1,
            msg:'服务器错误！'
        })
    })
})
// 下载文件
const dowloadPath = dirDocsPath + '/sign-docs/'
router.get('/download', (req, res, next) => {
    const {doc_id} = req.query
    fs.access(dowloadPath + doc_id, err => {
        if(!err){
            res.download(dowloadPath + doc_id)
        } else {
            res.send({status:1, msg:'文件不存在'})
        }
    })
})

// 尝试开启补签
router.post('/repeat-sign', (req, res, next) => {
    const {doc_id} = req.body
    documentModel.repeatSign(doc_id)
    .then(() => {
        res.send({status:0, data:{doc_id}})
    })
    .catch(err => {
        res.send({status:1, msg:'此文档不允许补签，或补签次数已用完'})
    })
})
module.exports = router;
